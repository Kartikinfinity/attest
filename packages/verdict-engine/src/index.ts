/**
 * @attest/verdict-engine
 *
 * Pure, deterministic verdict engine for MCP server behavior verification.
 * No network dependencies, no LLM calls — just data in, verdict out.
 */

export { deriveVerdict } from './derive-verdict.js';
export type {
  ToolBehaviorClaim,
  FixtureSnapshot,
  FixtureDiffEntry,
  Evidence,
  Verdict,
  OverallStatus,
  CertificationReport,
} from './types.js';
