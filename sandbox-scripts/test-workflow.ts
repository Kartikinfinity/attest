/**
 * Sandbox Script: Test Workflow
 *
 * Like test-tool.ts, but executes a SEQUENCE of related tool calls against
 * ONE shared fixture copy, producing a step-by-step Evidence timeline
 * instead of a single before/after diff.
 *
 * Why this exists: isolated single-call testing (test-tool.ts) catches a
 * mismatch that shows up on its own, but not one that only appears after a
 * prior step -- e.g. a "delete" tool that behaves correctly on an empty
 * fixture but misbehaves once something has actually been created and
 * modified. Tools that share an entity (create_X / get_X / update_X /
 * delete_X) are meaningfully related; testing them as a chain investigates
 * that relationship instead of treating every tool as independent.
 *
 * This supplements test-tool.ts's isolated tests -- it does not replace
 * them, and it does not change how a verdict is derived: each step's
 * Evidence object has the exact same shape test-tool.ts produces
 * (toolName/testInput/before/after/diff/rawResponse), so it feeds into the
 * SAME deterministic deriveVerdict() unchanged. This script only changes
 * how evidence is gathered, never how it's judged.
 *
 * Usage:
 *   npx tsx test-workflow.ts <serverDir> <fixtureSource> <port> '<stepsJson>'
 *   where stepsJson is: [{"toolName": "...", "args": {...}}, ...]
 *
 * Example:
 *   npx tsx test-workflow.ts . fixture.db 3010 \
 *     '[{"toolName":"create_invoice","args":{"customer":"Acme","amount":10}},
 *       {"toolName":"get_invoice","args":{"invoice_id":4}},
 *       {"toolName":"list_invoices","args":{}}]'
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, copyFileSync, unlinkSync } from 'node:fs';
import Database from 'better-sqlite3';
import path from 'node:path';

const serverDir = process.argv[2];
const fixtureSource = process.argv[3];
const port = process.argv[4];
const stepsJson = process.argv[5];

if (!serverDir || !fixtureSource || !port || !stepsJson) {
  console.error('Usage: test-workflow.ts <serverDir> <fixtureSource> <port> <stepsJson>');
  process.exit(1);
}

interface WorkflowStep {
  toolName: string;
  args: Record<string, unknown>;
}

const steps: WorkflowStep[] = JSON.parse(stepsJson);
if (!Array.isArray(steps) || steps.length === 0) {
  console.error('stepsJson must be a non-empty JSON array of {toolName, args}');
  process.exit(1);
}

const fixtureCopy = `${fixtureSource}.workflow-${port}.db`;

async function getSnapshot(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    rows[table.name] = db.prepare(`SELECT * FROM "${table.name.replace(/"/g, '""')}"`).all();
  }
  db.close();
  return {
    takenAt: new Date().toISOString(),
    rows,
  };
}

function computeDiff(before: any, after: any) {
  const diff: { table: string; change: 'added' | 'removed' | 'modified' | 'table_added' | 'table_removed'; rowSummary: string }[] = [];
  const allTables = new Set([...Object.keys(before.rows), ...Object.keys(after.rows)]);

  for (const table of allTables) {
    if (!before.rows[table]) {
      diff.push({ table, change: 'table_added', rowSummary: 'Table created' });
      continue;
    }
    if (!after.rows[table]) {
      diff.push({ table, change: 'table_removed', rowSummary: 'Table dropped' });
      continue;
    }

    const bRows = before.rows[table];
    const aRows = after.rows[table];

    if (aRows.length > bRows.length) {
      diff.push({ table, change: 'added', rowSummary: `${aRows.length - bRows.length} rows added` });
    } else if (aRows.length < bRows.length) {
      diff.push({ table, change: 'removed', rowSummary: `${bRows.length - aRows.length} rows removed` });
    } else if (JSON.stringify(bRows) !== JSON.stringify(aRows)) {
      diff.push({ table, change: 'modified', rowSummary: `rows modified` });
    }
  }
  return diff;
}

/**
 * Reliably terminate the spawned server process AND any children npm
 * creates underneath it. `child.kill()` alone only signals the immediate
 * child -- on Windows, spawn(..., {shell:true}) runs the command via
 * cmd.exe, so `.kill()` only terminates that shell wrapper, not the
 * actual node process npm launches underneath it (confirmed directly
 * while testing this script: the fixture copy stayed locked and the
 * port stayed listening after calling .kill() alone). `taskkill /t`
 * kills the whole tree.
 */
function killProcessTree(child: ReturnType<typeof spawn>) {
  if (process.platform === 'win32' && child.pid) {
    // execSync, not spawn -- must block until the tree is actually gone
    // before the caller proceeds to unlink the (now hopefully unlocked)
    // fixture copy. Using spawn() here raced ahead of taskkill finishing,
    // confirmed directly: the port freed correctly but the fixture file
    // was still locked immediately afterward.
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // Already exited on its own -- taskkill returns non-zero, fine.
    }
  } else {
    child.kill();
  }
}

async function waitForServer(port: string) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
      });
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server start timeout');
}

async function main() {
  if (!existsSync(fixtureSource)) {
    throw new Error(`Fixture not found: ${fixtureSource}`);
  }

  copyFileSync(fixtureSource, fixtureCopy);

  const serverProcess = spawn('npm', ['run', 'start'], {
    cwd: serverDir,
    env: { ...process.env, PORT: port, FIXTURE_PATH: path.resolve(fixtureCopy) },
    stdio: 'pipe',
    shell: true,
  });

  try {
    await waitForServer(port);

    const timeline: unknown[] = [];
    let previousSnapshot = await getSnapshot(fixtureCopy);

    for (const step of steps) {
      const beforeSnapshot = previousSnapshot;

      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: step.toolName, arguments: step.args },
        }),
      });

      const rawResponse = await res.json();

      if (!res.ok || rawResponse.error) {
        // Stop the chain on a hard failure -- continuing to call further
        // steps against a server that just errored would produce
        // meaningless evidence for the remaining tools, not useful
        // findings. The steps already completed are still real evidence.
        timeline.push({
          toolName: step.toolName,
          testInput: step.args,
          before: beforeSnapshot,
          after: beforeSnapshot,
          diff: [],
          rawResponse,
          stepError: `Call failed: ${JSON.stringify(rawResponse)}`,
        });
        break;
      }

      const afterSnapshot = await getSnapshot(fixtureCopy);
      const diff = computeDiff(beforeSnapshot, afterSnapshot);

      timeline.push({
        toolName: step.toolName,
        testInput: step.args,
        before: beforeSnapshot,
        after: afterSnapshot,
        diff,
        rawResponse,
      });

      previousSnapshot = afterSnapshot;
    }

    console.log('--- WORKFLOW EVIDENCE JSON ---');
    console.log(JSON.stringify(timeline, null, 2));
    console.log('------------------------------');
  } finally {
    killProcessTree(serverProcess);
    try {
      unlinkSync(fixtureCopy);
      unlinkSync(`${fixtureCopy}-wal`);
      unlinkSync(`${fixtureCopy}-shm`);
    } catch { /* ignore cleanup errors */ }
  }
}

main().catch(err => {
  console.error(`[test-workflow] ❌ Error: ${err.message}`);
  process.exit(1);
});
