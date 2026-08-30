/**
 * Read-only demo mode.
 *
 * Attest's real audit pipeline needs a local TrueForge instance, a Daytona
 * sandbox provider, the attest-internal MCP server and a writable SQLite
 * file. None of that exists on a serverless host, so a public deployment
 * cannot actually run audits.
 *
 * Rather than deploy something broken, ATTEST_DEMO_MODE serves one real,
 * completed audit from a JSON snapshot and refuses to start new ones. The
 * snapshot is exported straight from the local database -- the same
 * observed invoice-server results, the same verdicts from the same
 * deterministic engine. Nothing here is invented for display.
 *
 * This module deliberately does NOT import lib/models or lib/db, so the
 * better-sqlite3 native module is never loaded in a deployment that has no
 * database to talk to.
 */

import demoRun from './demo/demo-run.json';

export const DEMO_MODE = process.env.ATTEST_DEMO_MODE === '1';

/** Dashboard list shape (matches listRunsWithSummary). */
export function getDemoRunList() {
  return [demoRun.summary];
}

/** Detail shape (matches GET /api/audits/[id]). */
export function getDemoRun(id: string) {
  if (id !== demoRun.run.id) return null;
  return { run: demoRun.run, results: demoRun.results, evidence: demoRun.evidence };
}

export const DEMO_RUN_ID = demoRun.run.id;

/** Why a write was refused, phrased for the person who clicked the button. */
export const DEMO_WRITE_REFUSED =
  'This is a read-only demo deployment showing a completed audit. Running a new audit needs a local ' +
  'TrueForge instance, a Daytona sandbox and a model provider key, so it is disabled here. ' +
  'See the README for how to run a real audit locally.';
