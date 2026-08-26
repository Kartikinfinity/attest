/**
 * Attest Verdict Engine — Core Types
 *
 * These types model the evidence and verdict system described in the
 * architecture (§8). The verdict engine is a pure, deterministic function
 * over Evidence objects — the LLM never decides VERIFIED vs MISMATCH.
 */

// ---------------------------------------------------------------------------
// Claims (what the MCP server declares)
// ---------------------------------------------------------------------------

/**
 * What a single MCP tool declares about its behavior via annotations.
 * `undefined` means the server provided no annotation — which is itself
 * meaningful (the UNVERIFIABLE path).
 */
export interface ToolBehaviorClaim {
  toolName: string;
  declaredReadOnly: boolean | undefined;
  declaredDestructive: boolean | undefined;
  inputSchema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Evidence (what we actually observed)
// ---------------------------------------------------------------------------

/** A snapshot of the fixture state at a point in time. */
export interface FixtureSnapshot {
  takenAt: string;
  rows: Record<string, unknown[]>;
}

/** A single row-level change detected between two snapshots. */
export interface FixtureDiffEntry {
  table: string;
  change: 'added' | 'removed' | 'modified';
  rowSummary: string;
}

/** Evidence collected from executing one tool call against a fixture. */
export interface Evidence {
  toolName: string;
  testInput: Record<string, unknown>;
  before: FixtureSnapshot;
  after: FixtureSnapshot;
  diff: FixtureDiffEntry[];
  rawResponse: unknown;
}

// ---------------------------------------------------------------------------
// Verdicts (deterministic output)
// ---------------------------------------------------------------------------

export type Verdict =
  | { kind: 'VERIFIED'; toolName: string }
  | { kind: 'MISMATCH'; toolName: string; severity: 'HIGH' | 'MEDIUM'; evidence: Evidence }
  | { kind: 'UNVERIFIABLE'; toolName: string; reason: string }
  | { kind: 'TEST_FAILED'; toolName: string; error: string }
  | { kind: 'UNSAFE_TO_TEST'; toolName: string; reason: string };

// ---------------------------------------------------------------------------
// Certification Report (aggregated output)
// ---------------------------------------------------------------------------

export type OverallStatus = 'CERTIFIED' | 'FLAGGED' | 'INCONCLUSIVE';

export interface CertificationReport {
  serverRepo: string;
  commitSha: string;
  testedAt: string;
  verdicts: Verdict[];
  overall: OverallStatus;
  approvedBy: string | null;
}
