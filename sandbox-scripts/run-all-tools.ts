/**
 * Sandbox Script: Run All Tools (batch)
 *
 * Tests EVERY discovered tool in one process and writes a single JSON
 * result file, instead of requiring one agent command per tool.
 *
 * WHY THIS EXISTS
 *
 * The sandbox enforces a ~60s ceiling per agent command. A single
 * test-tool.ts run does not reliably fit inside it: it runs `npm run
 * start` (npm overhead + a tsx TypeScript compile), polls for the server
 * to come up, calls the tool, and snapshots SQLite twice. In a real run
 * every per-tool command timed out, and each subagent then improvised --
 * cat-ing source, probing `which npx`, hand-spawning servers, writing
 * throwaway scripts -- until TrueForge cancelled the whole turn with
 * "server-execution-timeout" after 541k tokens and ~10 minutes, having
 * never reached publish_certification.
 *
 * The fix is not to make the work faster; it is to stop blocking the
 * agent on it. This script is launched ONCE in the background, returns
 * immediately, and the agent polls a result file. Total agent commands
 * drop from dozens to roughly: launch, poll a few times, read.
 *
 * WHAT IS PRESERVED
 *
 * Isolation is unchanged and non-negotiable: every tool still gets its
 * OWN copy of the fixture and its OWN port, exactly as test-tool.ts does.
 * Each Evidence object has the identical shape test-tool.ts produces
 * (toolName/testInput/before/after/diff/rawResponse), so it feeds the
 * same deterministic deriveVerdict() unchanged. This changes how evidence
 * is GATHERED, never how a verdict is DECIDED.
 *
 * Usage:
 *   npx tsx run-all-tools.ts <serverDir> <fixturePath> <basePort> <toolsJson> <outFile>
 *
 * toolsJson: [{"toolName":"get_invoice","args":{"invoice_id":1}}, ...]
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, copyFileSync, unlinkSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import path from 'node:path';

const serverDir = process.argv[2];
const fixtureSource = process.argv[3];
const basePort = parseInt(process.argv[4] ?? '3100', 10);
const toolsJson = process.argv[5];
const outFile = process.argv[6] ?? '/tmp/attest-evidence.json';

if (!serverDir || !fixtureSource || !toolsJson) {
  console.error('Usage: run-all-tools.ts <serverDir> <fixturePath> <basePort> <toolsJson> [outFile]');
  process.exit(1);
}

interface ToolSpec {
  toolName: string;
  args: Record<string, unknown>;
}

const tools: ToolSpec[] = JSON.parse(toolsJson);

function killProcessTree(child: ReturnType<typeof spawn>) {
  if (process.platform === 'win32' && child.pid) {
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch { /* already exited */ }
  } else {
    child.kill();
  }
}

async function getSnapshot(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    rows[table.name] = db.prepare(`SELECT * FROM "${table.name.replace(/"/g, '""')}"`).all();
  }
  db.close();
  return { takenAt: new Date().toISOString(), rows };
}

function computeDiff(before: any, after: any) {
  const diff: { table: string; change: string; rowSummary: string }[] = [];
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
    const b = before.rows[table];
    const a = after.rows[table];
    if (a.length > b.length) {
      diff.push({ table, change: 'added', rowSummary: `${a.length - b.length} rows added` });
    } else if (a.length < b.length) {
      diff.push({ table, change: 'removed', rowSummary: `${b.length - a.length} rows removed` });
    } else if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff.push({ table, change: 'modified', rowSummary: 'rows modified' });
    }
  }
  return diff;
}

async function waitForServer(port: number, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
      });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Server did not become reachable on port ${port}`);
}

/** Test one tool against its own fixture copy on its own port. */
async function testOne(spec: ToolSpec, port: number) {
  const fixtureCopy = `${fixtureSource}.batch-${port}.db`;
  copyFileSync(fixtureSource, fixtureCopy);

  const server = spawn('npm', ['run', 'start'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), FIXTURE_PATH: path.resolve(fixtureCopy) },
    stdio: 'pipe',
    shell: true,
  });

  try {
    await waitForServer(port);
    const before = await getSnapshot(fixtureCopy);

    const res = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: spec.toolName, arguments: spec.args },
      }),
    });
    const rawResponse = await res.json();
    const after = await getSnapshot(fixtureCopy);

    return {
      toolName: spec.toolName,
      testInput: spec.args,
      before,
      after,
      diff: computeDiff(before, after),
      rawResponse,
    };
  } finally {
    killProcessTree(server);
    for (const suffix of ['', '-wal', '-shm']) {
      try { unlinkSync(fixtureCopy + suffix); } catch { /* ignore */ }
    }
  }
}

async function main() {
  if (!existsSync(fixtureSource)) {
    throw new Error(`Fixture not found: ${fixtureSource}`);
  }

  const evidence: unknown[] = [];
  const errors: { toolName: string; error: string }[] = [];

  for (let i = 0; i < tools.length; i++) {
    const spec = tools[i];
    const port = basePort + i;
    console.log(`[run-all-tools] (${i + 1}/${tools.length}) ${spec.toolName} on port ${port}...`);
    try {
      evidence.push(await testOne(spec, port));
      console.log(`[run-all-tools] ${spec.toolName} OK`);
    } catch (err: any) {
      // One tool failing must not abandon the others -- partial evidence
      // is still a usable audit, and the failure is reported explicitly
      // rather than silently dropping the tool.
      console.error(`[run-all-tools] ${spec.toolName} FAILED: ${err?.message}`);
      errors.push({ toolName: spec.toolName, error: err?.message ?? String(err) });
    }
  }

  // Written last and in one shot, so the presence of this file is itself
  // the "done" signal the polling agent waits for -- no partial reads.
  writeFileSync(outFile, JSON.stringify({ status: 'complete', evidence, errors }, null, 2));
  console.log(`[run-all-tools] DONE. ${evidence.length} evidence, ${errors.length} errors -> ${outFile}`);
}

main().catch(err => {
  writeFileSync(outFile, JSON.stringify({ status: 'error', error: err?.message ?? String(err) }, null, 2));
  console.error(`[run-all-tools] FATAL: ${err?.message}`);
  process.exit(1);
});
