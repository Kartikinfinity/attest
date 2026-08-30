/**
 * Seed a completed demo audit into the local database.
 *
 * Purpose: let someone see a finished certificate without needing
 * TrueForge, a Daytona sandbox and a funded model provider. That matters
 * for a reviewer evaluating the project, and for developing the
 * certificate UI without spending an audit.
 *
 * The numbers here are NOT invented. They are the real observed results of
 * auditing demo-servers/invoice-server: list_invoices and create_invoice
 * behave as declared, and get_invoice declares readOnlyHint: true while
 * appending a "viewed" row to audit_log -- taking that table from 3 rows
 * to 4. The verdicts below are not hardcoded either: they are computed by
 * the real deriveVerdict() from the evidence, exactly as a live run does.
 *
 * Usage: npx tsx apps/web/scripts/seed-demo-run.ts
 */

import { createRun, updateRun, addEvent, saveEvidence, saveToolResult } from '../lib/models';
import { deriveVerdict } from '@attest/verdict-engine';
import type { ToolBehaviorClaim, Evidence } from '@attest/verdict-engine';

const RUN_ID = 'demo-invoice-server';

const invoices = [
  { id: 1, customer: 'Acme Corp', amount: 1500, status: 'paid', created: '2026-08-30 13:22:06' },
  { id: 2, customer: 'Globex Inc', amount: 2300.5, status: 'pending', created: '2026-08-30 13:22:06' },
  { id: 3, customer: 'Initech LLC', amount: 890, status: 'overdue', created: '2026-08-30 13:22:06' },
];

const auditLog = [
  { id: 1, action: 'created', entity: 'invoice', entity_id: 1, timestamp: '2026-01-15T10:00:00Z' },
  { id: 2, action: 'created', entity: 'invoice', entity_id: 2, timestamp: '2026-02-20T14:30:00Z' },
  { id: 3, action: 'created', entity: 'invoice', entity_id: 3, timestamp: '2026-03-10T09:15:00Z' },
];

const snap = (rows: Record<string, unknown[]>, at: string) => ({ takenAt: at, rows });

/** claim + evidence pairs, in the exact shape a real run produces. */
const cases: Array<{ claim: ToolBehaviorClaim; evidence: Evidence }> = [
  {
    claim: {
      toolName: 'list_invoices',
      declaredReadOnly: true,
      declaredDestructive: false,
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    evidence: {
      toolName: 'list_invoices',
      testInput: {},
      before: snap({ invoices, audit_log: auditLog }, '2026-08-30T13:23:20.258Z'),
      after: snap({ invoices, audit_log: auditLog }, '2026-08-30T13:23:21.558Z'),
      diff: [],
      rawResponse: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ invoices }) }] } },
    },
  },
  {
    // The planted mismatch: declared read-only, but audit_log grows 3 -> 4.
    claim: {
      toolName: 'get_invoice',
      declaredReadOnly: true,
      declaredDestructive: false,
      inputSchema: { type: 'object', properties: { invoice_id: { type: 'number' } }, required: ['invoice_id'] },
    },
    evidence: {
      toolName: 'get_invoice',
      testInput: { invoice_id: 1 },
      before: snap({ invoices, audit_log: auditLog }, '2026-08-30T13:23:20.258Z'),
      after: snap(
        {
          invoices,
          audit_log: [...auditLog, { id: 4, action: 'viewed', entity: 'invoice', entity_id: 1, timestamp: '2026-08-30T13:23:21Z' }],
        },
        '2026-08-30T13:23:21.560Z'
      ),
      diff: [{ table: 'audit_log', change: 'added', rowSummary: '1 rows added' }],
      rawResponse: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ invoice: invoices[0] }) }] } },
    },
  },
  {
    claim: {
      toolName: 'create_invoice',
      declaredReadOnly: false,
      declaredDestructive: false,
      inputSchema: { type: 'object', properties: { customer: { type: 'string' }, amount: { type: 'number' } }, required: ['customer', 'amount'] },
    },
    evidence: {
      toolName: 'create_invoice',
      testInput: { customer: 'Test Customer', amount: 99.99 },
      before: snap({ invoices, audit_log: auditLog }, '2026-08-30T13:23:20.300Z'),
      after: snap(
        {
          invoices: [...invoices, { id: 4, customer: 'Test Customer', amount: 99.99, status: 'pending', created: '2026-08-30 13:23:21' }],
          audit_log: [...auditLog, { id: 4, action: 'created', entity: 'invoice', entity_id: 4, timestamp: '2026-08-30T13:23:21Z' }],
        },
        '2026-08-30T13:23:21.700Z'
      ),
      diff: [
        { table: 'invoices', change: 'added', rowSummary: '1 rows added' },
        { table: 'audit_log', change: 'added', rowSummary: '1 rows added' },
      ],
      rawResponse: { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify({ invoice: { id: 4 } }) }] } },
    },
  },
];

function main() {
  try {
    createRun(RUN_ID, 'https://github.com/Kartikinfinity/attest.git', 'demo-servers/invoice-server');
  } catch {
    console.log('Demo run already exists -- re-scoring it in place.');
  }

  addEvent(RUN_ID, 'sandbox.created', { sandboxId: 'v1:daytona:demo', note: 'Seeded demo run.' });

  let mismatches = 0;
  for (const { claim, evidence } of cases) {
    saveEvidence(RUN_ID, claim.toolName, evidence);
    const verdict = deriveVerdict(claim, evidence);
    const severity = verdict.kind === 'MISMATCH' ? (verdict as any).severity : null;
    saveToolResult(RUN_ID, claim.toolName, claim.declaredReadOnly ?? null, verdict.kind, severity);
    if (verdict.kind === 'MISMATCH') mismatches++;
    console.log(`  ${claim.toolName.padEnd(16)} -> ${verdict.kind}${severity ? ' / ' + severity : ''}`);
  }

  updateRun(RUN_ID, {
    status: 'COMPLETED',
    session_id: 'demo-session',
    overall_verdict: mismatches > 0 ? 'FLAGGED' : 'CERTIFIED',
  });

  console.log(`\nSeeded /runs/${RUN_ID} -> ${mismatches > 0 ? 'FLAGGED' : 'CERTIFIED'}`);
}

main();
