import { db } from './db';

export interface Run {
  id: string;
  repo_url: string;
  server_dir: string;
  status: 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  session_id: string | null;
  overall_verdict: string | null;
  created_at: string;
  updated_at: string;
}

export function createRun(id: string, repoUrl: string, serverDir: string): Run {
  const stmt = db.prepare(
    "INSERT INTO runs (id, repo_url, server_dir, status) VALUES (?, ?, ?, 'PENDING') RETURNING *"
  );
  return stmt.get(id, repoUrl, serverDir) as Run;
}

export function updateRun(id: string, updates: Partial<Run>): void {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const sets = keys.map(k => k + ' = ?').join(', ');
  const values = Object.values(updates);

  const stmt = db.prepare(
    "UPDATE runs SET " + sets + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  stmt.run(...values, id);
}

export function getRun(id: string): Run | undefined {
  const stmt = db.prepare('SELECT * FROM runs WHERE id = ?');
  return stmt.get(id) as Run | undefined;
}

export function listRuns(): Run[] {
  const stmt = db.prepare('SELECT * FROM runs ORDER BY created_at DESC');
  return stmt.all() as Run[];
}

export function addEvent(runId: string, type: string, data: any) {
  const stmt = db.prepare(
    "INSERT INTO events (run_id, type, data) VALUES (?, ?, ?)"
  );
  stmt.run(runId, type, JSON.stringify(data));
}

export function getEvents(runId: string, afterId: number = 0) {
  const stmt = db.prepare('SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id ASC');
  return stmt.all(runId, afterId).map((row: any) => ({
    ...row,
    data: JSON.parse(row.data)
  }));
}

export function saveEvidence(runId: string, toolName: string, evidenceObj: any) {
  const stmt = db.prepare(
    "INSERT INTO evidence (run_id, tool_name, test_input, before_snapshot, after_snapshot, diff, raw_response) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  // Field names must match the Evidence shape sandbox-scripts/test-tool.ts
  // actually produces (testInput/before/after/diff/rawResponse) -- the
  // previous names here (snapshotBefore/snapshotAfter/toolResponse) never
  // matched anything real, so before/after snapshots and raw response were
  // always persisted as empty defaults regardless of what was observed.
  stmt.run(
    runId,
    toolName,
    JSON.stringify(evidenceObj.testInput || {}),
    JSON.stringify(evidenceObj.before || []),
    JSON.stringify(evidenceObj.after || []),
    JSON.stringify(evidenceObj.diff || []),
    JSON.stringify(evidenceObj.rawResponse || {})
  );
}

export function saveToolResult(runId: string, toolName: string, declaredReadOnly: boolean | null, verdict: string, severity: string | null) {
  const stmt = db.prepare(
    "INSERT INTO tool_results (run_id, tool_name, declared_read_only, verdict, severity) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(runId, toolName, declaredReadOnly === null ? null : (declaredReadOnly ? 1 : 0), verdict, severity);
}

export function getEvidence(runId: string) {
  const stmt = db.prepare('SELECT * FROM evidence WHERE run_id = ?');
  return stmt.all(runId).map((row: any) => ({
    ...row,
    test_input: JSON.parse(row.test_input),
    before_snapshot: JSON.parse(row.before_snapshot),
    after_snapshot: JSON.parse(row.after_snapshot),
    diff: JSON.parse(row.diff),
    raw_response: JSON.parse(row.raw_response),
  }));
}

export function getToolResults(runId: string) {
  const stmt = db.prepare('SELECT * FROM tool_results WHERE run_id = ?');
  return stmt.all(runId).map((row: any) => ({
    ...row,
    declared_read_only: row.declared_read_only === null ? null : Boolean(row.declared_read_only)
  }));
}
