/**
 * test-workflow.ts — Integration Test
 *
 * Exercises the actual sandbox-scripts/test-workflow.ts script (not a
 * reimplementation of its logic) against a real running notes-server,
 * verifying the core claim of the workflow-chain testing capability:
 * a multi-step Evidence timeline where each step's diff is computed
 * against the PREVIOUS step's snapshot, not a single overall before/after.
 *
 * This is what Core Idea #4/#9 (agentic, relationship-aware testing)
 * concretely produces -- a create -> search chain here, since notes-server
 * only has two tools, but the same script handles any tool sequence the
 * auditor agent identifies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const NOTES_SERVER_DIR = path.join(REPO_ROOT, 'demo-servers', 'notes-server');
const FIXTURE_SOURCE = path.join(NOTES_SERVER_DIR, 'fixture.db');
const TEST_PORT = '3097'; // distinct from the other integration tests' ports (3098/3099)

// Relative to REPO_ROOT (used as the child process's cwd below) rather
// than absolute paths -- this repo's own directory name has spaces
// ("ai agent harness hackthon"), and execFileSync's shell:true does NOT
// escape/quote arguments for you, only concatenates them -- an absolute
// path here gets split apart as if it were multiple arguments. Confirmed
// directly: this is exactly what broke on the first attempt.
const TEST_WORKFLOW_SCRIPT_REL = path.join('sandbox-scripts', 'test-workflow.ts');
const NOTES_SERVER_DIR_REL = path.join('demo-servers', 'notes-server');
const FIXTURE_SOURCE_REL = path.join(NOTES_SERVER_DIR_REL, 'fixture.db');

function cleanupFixtureCopy() {
  const copyPath = `${FIXTURE_SOURCE}.workflow-${TEST_PORT}.db`;
  for (const suffix of ['', '-wal', '-shm']) {
    const f = copyPath + suffix;
    if (existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore -- see the process-tree-kill fix's own comment */ }
    }
  }
}

describe('test-workflow.ts integration', () => {
  beforeAll(() => {
    if (!existsSync(FIXTURE_SOURCE)) {
      execFileSync('npx', ['tsx', 'src/seed-fixture.ts'], { cwd: NOTES_SERVER_DIR, shell: true });
    }
  });

  afterAll(() => {
    cleanupFixtureCopy();
  });

  it('produces a sequential Evidence timeline for a create -> search chain', () => {
    const steps = JSON.stringify([
      { toolName: 'create_note', args: { title: 'Workflow chain test', content: 'produced by test-workflow.integration.test.ts' } },
      { toolName: 'search_notes', args: { query: 'Workflow chain test' } },
    ]);

    // Invoking tsx's own CLI entry directly via `node`, with shell:false
    // (the default) -- NOT `npx tsx ... {shell:true}`. shell:true doesn't
    // escape/quote array arguments at all, it just joins them with spaces
    // for cmd.exe; the steps JSON argument itself contains spaces (e.g.
    // "Workflow chain test"), so it would get split apart the same way
    // the absolute paths did on the first attempt. Bypassing the shell
    // entirely means each array element is a genuinely separate argument
    // on every platform, no quoting needed.
    const tsxCli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const output = execFileSync(
      process.execPath,
      [tsxCli, TEST_WORKFLOW_SCRIPT_REL, NOTES_SERVER_DIR_REL, FIXTURE_SOURCE_REL, TEST_PORT, steps],
      { encoding: 'utf8', timeout: 30000, cwd: REPO_ROOT }
    );

    const match = output.match(/--- WORKFLOW EVIDENCE JSON ---\n([\s\S]*?)\n------------------------------/);
    expect(match).not.toBeNull();
    const timeline = JSON.parse(match![1]);

    expect(timeline).toHaveLength(2);

    // Step 1: create_note -- genuinely writes, diff should show a row added.
    const step1 = timeline[0];
    expect(step1.toolName).toBe('create_note');
    expect(step1.diff.length).toBeGreaterThan(0);
    expect(step1.diff[0].change).toBe('added');

    // Step 2: search_notes -- genuinely read-only, diff should be EMPTY,
    // even though it's searching for the note step 1 JUST created (proving
    // this is a real sequential chain, not two independent isolated calls
    // against the same static seed data).
    const step2 = timeline[1];
    expect(step2.toolName).toBe('search_notes');
    expect(step2.diff).toEqual([]);

    const searchResultText = step2.rawResponse.result.content[0].text;
    const searchResult = JSON.parse(searchResultText);
    expect(searchResult.notes.some((n: any) => n.title === 'Workflow chain test')).toBe(true);

    // The chain's step 2 "before" snapshot must equal step 1's "after"
    // snapshot -- that's what makes this a TIMELINE, not two separate
    // before/after pairs each measured from the original baseline.
    expect(step2.before.rows.notes).toEqual(step1.after.rows.notes);
  });
});
