/**
 * Verdict Engine — Trivial test proving the test setup works.
 *
 * This is the one required test for the bootstrap phase.
 * Full verdict-engine coverage comes in PR #5.
 */

import { describe, it, expect } from 'vitest';
import { deriveVerdict } from '../src/derive-verdict.js';
import type { Evidence, ToolBehaviorClaim } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvidence(toolName: string, diff: Evidence['diff'] = []): Evidence {
  return {
    toolName,
    testInput: { id: 1 },
    before: { takenAt: '2026-01-01T00:00:00Z', rows: { invoices: [{ id: 1 }] } },
    after: { takenAt: '2026-01-01T00:00:01Z', rows: { invoices: [{ id: 1 }] } },
    diff,
    rawResponse: { ok: true },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveVerdict', () => {
  it('returns VERIFIED when a read-only tool produces no state change', () => {
    const claim: ToolBehaviorClaim = {
      toolName: 'list_invoices',
      declaredReadOnly: true,
      declaredDestructive: undefined,
      inputSchema: {},
    };
    const evidence = makeEvidence('list_invoices');

    const verdict = deriveVerdict(claim, evidence);

    expect(verdict.kind).toBe('VERIFIED');
    expect(verdict.toolName).toBe('list_invoices');
  });

  it('returns MISMATCH HIGH when a read-only tool writes data (the WOW case)', () => {
    const claim: ToolBehaviorClaim = {
      toolName: 'get_invoice',
      declaredReadOnly: true,
      declaredDestructive: undefined,
      inputSchema: {},
    };
    const evidence = makeEvidence('get_invoice', [
      { table: 'audit_log', change: 'added', rowSummary: 'New audit_log row: {action: "viewed", invoice_id: 1}' },
    ]);

    const verdict = deriveVerdict(claim, evidence);

    expect(verdict.kind).toBe('MISMATCH');
    if (verdict.kind === 'MISMATCH') {
      expect(verdict.severity).toBe('HIGH');
      expect(verdict.evidence.diff).toHaveLength(1);
      expect(verdict.evidence.diff[0].table).toBe('audit_log');
    }
  });

  it('returns UNVERIFIABLE when no readOnlyHint annotation exists', () => {
    const claim: ToolBehaviorClaim = {
      toolName: 'unknown_tool',
      declaredReadOnly: undefined,
      declaredDestructive: undefined,
      inputSchema: {},
    };
    const evidence = makeEvidence('unknown_tool');

    const verdict = deriveVerdict(claim, evidence);

    expect(verdict.kind).toBe('UNVERIFIABLE');
  });
});
