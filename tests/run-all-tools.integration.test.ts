/**
 * run-all-tools.ts — Integration Test
 *
 * Exercises the actual batch script against a real running notes-server.
 *
 * This script is the audit's critical path: it replaced per-tool subagent
 * commands, which could not finish inside the sandbox's ~60s per-command
 * ceiling and caused runs to be cancelled with "server-execution-timeout"
 * after burning ~541k tokens. What matters here is that ONE invocation
 * produces evidence for EVERY tool, in the exact shape deriveVerdict()
 * consumes, with per-tool isolation intact.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const NOTES_SERVER_DIR = path.join(REPO_ROOT, 'demo-servers', 'notes-server');
const FIXTURE_SOURCE = path.join(NOTES_SERVER_DIR, 'fixture.db');

// Relative to REPO_ROOT (the child's cwd): this repo's directory name
// contains spaces, and passing absolute paths through a shell-quoted
// argv is where that bites.
const SCRIPT_REL = path.join('sandbox-scripts', 'run-all-tools.ts');
const SERVER_REL = path.join('demo-servers', 'notes-server');
const FIXTURE_REL = path.join(SERVER_REL, 'fixture.db');

const BASE_PORT = '3140';
let outDir: string;
let outFile: string;

describe('run-all-tools.ts integration', () => {
  beforeAll(() => {
    if (!existsSync(FIXTURE_SOURCE)) {
      execFileSync('npx', ['tsx', 'src/seed-fixture.ts'], { cwd: NOTES_SERVER_DIR, shell: true });
    }
    outDir = mkdtempSync(path.join(tmpdir(), 'attest-batch-'));
    outFile = path.join(outDir, 'evidence.json');
  });

  afterAll(() => {
    try { rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
    // Any fixture copy the script failed to clean up would be a real leak.
    for (const p of [0, 1]) {
      for (const suffix of ['', '-wal', '-shm']) {
        const f = `${FIXTURE_SOURCE}.batch-${Number(BASE_PORT) + p}.db${suffix}`;
        if (existsSync(f)) { try { unlinkSync(f); } catch { /* ignore */ } }
      }
    }
  });

  it('produces evidence for every tool in a single invocation', () => {
    const tools = JSON.stringify([
      { toolName: 'search_notes', args: { query: 'pasta' } },
      { toolName: 'create_note', args: { title: 'Batch test', content: 'from run-all-tools integration test' } },
    ]);

    // node + tsx's CLI directly, shell:false -- shell:true does not quote
    // argv, and the tools JSON contains spaces.
    const tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    execFileSync(
      process.execPath,
      [tsxCli, SCRIPT_REL, SERVER_REL, FIXTURE_REL, BASE_PORT, tools, outFile],
      { cwd: REPO_ROOT, timeout: 120000, encoding: 'utf8' }
    );

    const result = JSON.parse(readFileSync(outFile, 'utf8'));

    expect(result.status).toBe('complete');
    expect(result.errors).toEqual([]);
    expect(result.evidence).toHaveLength(2);

    // Every entry must match the shape deriveVerdict() consumes -- if this
    // drifts from test-tool.ts's output, verdicts silently break.
    for (const e of result.evidence) {
      for (const key of ['toolName', 'testInput', 'before', 'after', 'diff', 'rawResponse']) {
        expect(e, `evidence entry missing "${key}"`).toHaveProperty(key);
      }
    }

    const byName = Object.fromEntries(result.evidence.map((e: any) => [e.toolName, e]));

    // The read-only tool must show NO state change, and the writing tool
    // must show one -- that contrast is the whole product in miniature.
    expect(byName.search_notes.diff).toEqual([]);
    expect(byName.create_note.diff.length).toBeGreaterThan(0);
    expect(byName.create_note.diff[0].change).toBe('added');

    // Isolation: create_note ran on its own fixture copy, so the row it
    // added must NOT be visible in the other tool's snapshots.
    const searchRows = byName.search_notes.after.rows.notes;
    expect(searchRows.some((n: any) => n.title === 'Batch test')).toBe(false);
  });
});
