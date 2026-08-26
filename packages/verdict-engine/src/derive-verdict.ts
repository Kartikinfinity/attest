/**
 * Attest Verdict Engine — Deterministic Verdict Derivation
 *
 * This is the core of Attest: a pure function that derives a verdict
 * from evidence and a tool's declared annotations.
 *
 * The logic is intentionally simple and deterministic (§8):
 *
 *   diff.length === 0 && declaredReadOnly === true   → VERIFIED
 *   diff.length  > 0 && declaredReadOnly === true    → MISMATCH, HIGH
 *   diff.length === 0 && declaredReadOnly === false   → MISMATCH, MEDIUM
 *   diff.length  > 0 && declaredReadOnly === false    → VERIFIED
 *   declaredReadOnly === undefined                    → UNVERIFIABLE
 *
 * The LLM NEVER decides the verdict. This function does.
 */

import type { Evidence, ToolBehaviorClaim, Verdict } from './types.js';

/**
 * Derive a verdict for a single tool from its declared behavior and
 * the observed evidence.
 *
 * @param claim - What the tool declares (annotations from tools/list)
 * @param evidence - What was actually observed (before/after fixture diff)
 * @returns A deterministic Verdict
 */
export function deriveVerdict(claim: ToolBehaviorClaim, evidence: Evidence): Verdict {
  const { toolName, declaredReadOnly } = claim;
  const hasStateChange = evidence.diff.length > 0;

  // No annotation → cannot compare declared vs. observed
  if (declaredReadOnly === undefined) {
    return {
      kind: 'UNVERIFIABLE',
      toolName,
      reason: 'No readOnlyHint annotation declared — cannot compare against observed behavior.',
    };
  }

  if (declaredReadOnly) {
    // Declared read-only
    if (!hasStateChange) {
      // Claimed read-only, observed no writes → annotations match behavior
      return { kind: 'VERIFIED', toolName };
    } else {
      // Claimed read-only, but writes detected → the core mismatch Attest exists to catch
      return { kind: 'MISMATCH', toolName, severity: 'HIGH', evidence };
    }
  } else {
    // Declared as writing (readOnly = false)
    if (hasStateChange) {
      // Claimed writes, observed writes → annotations match behavior
      return { kind: 'VERIFIED', toolName };
    } else {
      // Claimed writes, but nothing changed — suspicious but lower severity
      return { kind: 'MISMATCH', toolName, severity: 'MEDIUM', evidence };
    }
  }
}
