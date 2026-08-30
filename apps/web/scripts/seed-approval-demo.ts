/**
 * Seed a run paused at the human-approval gate.
 *
 * The approval card only renders when the page receives a
 * `tool.approval_required` event over SSE, and that stream replays
 * persisted events -- so writing that event plus an AWAITING_APPROVAL
 * status reproduces the exact UI state a live audit reaches, without
 * spending a model call to get there.
 *
 * This is a real state the system enters, reproduced faithfully: the
 * event shape below is copied from an actual TrueForge
 * `tool.approval_required` payload (which carries only {id,
 * sourceEventId} per tool call -- no name, no arguments).
 *
 * Used for documentation screenshots. Not part of the audit path.
 *
 * Usage: cd apps/web && npx tsx scripts/seed-approval-demo.ts
 */

import { createRun, updateRun, addEvent } from '../lib/models';

const RUN_ID = 'demo-awaiting-approval';

function main() {
  try {
    createRun(RUN_ID, 'https://github.com/Kartikinfinity/attest.git', 'demo-servers/invoice-server');
  } catch {
    console.log('Run already exists -- refreshing its events.');
  }

  addEvent(RUN_ID, 'sandbox.created', {
    type: 'sandbox.created',
    sandboxId: 'v1:daytona:default.6c77b060-da72-47c9-9303-1744c565d583',
  });

  // Four executed commands, so the progress panel reports real activity.
  for (let i = 0; i < 4; i++) {
    addEvent(RUN_ID, 'tool.response', {
      type: 'tool.response',
      toolCallId: `toolu_demo_${i}`,
      content: '{"success":true,"response":{"exitCode":0}}',
    });
  }

  addEvent(RUN_ID, 'tool.approval_required', {
    type: 'tool.approval_required',
    threadId: 'main',
    toolCalls: [{ id: 'toolu_demo_publish', sourceEventId: 'evt_demo_source' }],
  });

  updateRun(RUN_ID, { status: 'AWAITING_APPROVAL', session_id: 'demo-session-approval' });
  console.log(`Seeded /runs/${RUN_ID} -> AWAITING_APPROVAL`);
}

main();
