/**
 * Attest — TrueForge SDK Smoke Test
 *
 * A minimal script that confirms the TrueForge SDK can:
 * 1. Connect to a running TrueForge instance
 * 2. Create a session
 * 3. Stream a reply
 *
 * Prerequisites:
 *   1. TrueForge running: npx @truefoundry/trueforge@latest
 *   2. Model configured in Settings → Models
 *
 * Usage:
 *   npx tsx agent/smoke-test.ts
 *
 * Expected output:
 *   ✅ Connected to TrueForge at http://localhost:8790
 *   ✅ Session created: <session-id>
 *   ✅ Received streamed reply
 *   --- Reply content ---
 *   <model's reply>
 *   ---
 */

import { TrueForge } from '@truefoundry/trueforge-sdk';

async function main() {
  const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';

  console.log(`Connecting to TrueForge at ${baseUrl}...`);
  const client = new TrueForge({ baseUrl });

  // Step 1: Create a session (uses the default model, not attest-auditor)
  console.log('Creating session...');
  const { data: session } = await client.sessions.create({
    agent: { spec: { model: { name: 'anthropic/claude-sonnet-4-6' } } }
  });
  console.log(`✅ Session created: ${session.id}`);

  // Step 2: Send a simple message and stream the reply
  console.log('Sending test message...');
  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{
      type: 'user.message',
      content: 'Reply with exactly: "Attest smoke test passed." Nothing else.',
    }],
  });

  // Step 3: Collect and print streamed events
  let gotReply = false;
  for await (const { data: event } of stream.withMetadata()) {
    if (event.type === 'model.message') {
      gotReply = true;
      console.log('✅ Received streamed reply');
      console.log('--- Reply content ---');
      if (typeof event.content === 'string') {
        console.log(event.content);
      } else {
        console.log(JSON.stringify(event.content, null, 2));
      }
      console.log('---');
    }
  }

  if (!gotReply) {
    console.warn('⚠️  No agent.message event received. Check TrueForge logs.');
    process.exit(1);
  }

  console.log('\n✅ Smoke test complete. SDK → TrueForge path works end to end.');
}

main().catch((err: Error) => {
  console.error('❌ Smoke test failed:', err.message);
  console.error('\nTroubleshooting:');
  console.error('  1. Is TrueForge running? → npx @truefoundry/trueforge@latest');
  console.error('  2. Is a model configured? → Settings → Models in the TrueForge UI');
  console.error(`  3. Is the URL correct? → TRUEFORGE_BASE_URL=${process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790'}`);
  process.exit(1);
});
