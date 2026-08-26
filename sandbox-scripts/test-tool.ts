/**
 * Sandbox Script: Test Tool
 *
 * Runs inside the TrueForge/Daytona sandbox to execute a single MCP tool test
 * and produce a deterministic Evidence object (before/after fixture diff).
 *
 * Usage:
 *   npx tsx <path-to-attest-repo>/sandbox-scripts/test-tool.ts <server-dir> <tool-name> <fixture-path> <port> '<mcp-args-json>'
 *
 * Example:
 *   npx tsx ../../sandbox-scripts/test-tool.ts . get_invoice fixture.db 3005 '{"invoice_id": 1}'
 */

import { spawn } from 'node:child_process';
import { existsSync, copyFileSync, unlinkSync } from 'node:fs';
import Database from 'better-sqlite3';
import path from 'node:path';

const serverDir = process.argv[2];
const toolName = process.argv[3];
const fixtureSource = process.argv[4];
const port = process.argv[5];
const argsJson = process.argv[6];

if (!serverDir || !toolName || !fixtureSource || !port || !argsJson) {
  console.error('Usage: test-tool.ts <serverDir> <toolName> <fixtureSource> <port> <argsJson>');
  process.exit(1);
}

const args = JSON.parse(argsJson);
const fixtureCopy = `${fixtureSource}.test-${port}.db`;

async function getSnapshot(dbPath: string) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    rows[table.name] = db.prepare(`SELECT * FROM ${table.name}`).all();
  }
  db.close();
  return {
    takenAt: new Date().toISOString(),
    rows,
  };
}

function computeDiff(before: any, after: any) {
  const diff: { table: string; change: 'added' | 'removed' | 'modified'; rowSummary: string }[] = [];
  
  for (const table of Object.keys(after.rows)) {
    const bRows = before.rows[table] || [];
    const aRows = after.rows[table] || [];
    
    // Simplistic diff for MVP: just compare row counts
    if (aRows.length > bRows.length) {
      diff.push({ table, change: 'added', rowSummary: `${aRows.length - bRows.length} rows added` });
    } else if (aRows.length < bRows.length) {
      diff.push({ table, change: 'removed', rowSummary: `${bRows.length - aRows.length} rows removed` });
    } else {
      // Very basic modification check (stringify)
      if (JSON.stringify(bRows) !== JSON.stringify(aRows)) {
        diff.push({ table, change: 'modified', rowSummary: `rows modified` });
      }
    }
  }
  return diff;
}

async function main() {
  if (!existsSync(fixtureSource)) {
    throw new Error(`Fixture not found: ${fixtureSource}`);
  }

  // 1. Copy fixture (Subagent isolation)
  copyFileSync(fixtureSource, fixtureCopy);

  // 2. Snapshot before
  const beforeSnapshot = await getSnapshot(fixtureCopy);

  // 3. Start server
  const serverProcess = spawn('npm', ['run', 'start'], {
    cwd: serverDir,
    env: { ...process.env, PORT: port, FIXTURE_PATH: path.resolve(fixtureCopy) },
    stdio: 'pipe',
    shell: true,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
    serverProcess.stdout.on('data', (d) => {
      if (d.toString().includes('running on http')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  // 4. Call tool
  let rawResponse: unknown;
  try {
    const res = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    rawResponse = await res.json();
  } finally {
    serverProcess.kill();
  }

  // 5. Snapshot after
  const afterSnapshot = await getSnapshot(fixtureCopy);

  // 6. Compute diff
  const diff = computeDiff(beforeSnapshot, afterSnapshot);

  // 7. Cleanup copy
  try {
    unlinkSync(fixtureCopy);
    unlinkSync(`${fixtureCopy}-wal`);
    unlinkSync(`${fixtureCopy}-shm`);
  } catch { /* ignore */ }

  // 8. Output Evidence
  const evidence = {
    toolName,
    testInput: args,
    before: beforeSnapshot,
    after: afterSnapshot,
    diff,
    rawResponse,
  };

  // The agent parses this JSON block
  console.log('--- EVIDENCE JSON ---');
  console.log(JSON.stringify(evidence, null, 2));
  console.log('---------------------');
}

main().catch(err => {
  console.error(`[test-tool] ❌ Error: ${err.message}`);
  process.exit(1);
});
