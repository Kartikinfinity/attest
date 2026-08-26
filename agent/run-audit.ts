/**
 * Attest — Vertical Slice Runner
 *
 * Implements Phase 27 from the Master Build Plan:
 * "The smallest end-to-end proof, targeted for end of Thursday"
 *
 * 1. Opens a session on attest-auditor.
 * 2. Tells it to clone the attest repo, start invoice-server, and call get_invoice.
 * 3. Prints the raw Evidence object (showing audit_log going from 3 rows to 4).
 *
 * Usage:
 *   npx tsx agent/run-audit.ts
 */

import { createClient, startAuditSession, handleApproval } from './agent-spec.js';
import { TrueForge } from '@truefoundry/trueforge-sdk';

const REPO_URL = 'https://github.com/Kartikinfinity/attest.git';
const SERVER_DIR = 'demo-servers/invoice-server';

async function main() {
  const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
  console.log(`Connecting to TrueForge at ${baseUrl}...`);
  const client = new TrueForge({ baseUrl });

  console.log('Creating session with attest-auditor agent...');
  const { data: session } = await client.sessions.create({
    agent: { name: 'attest-auditor' },
  });
  console.log(`✅ Session created: ${session.id}`);

  const prompt = `
You are auditing an MCP server.
Repo: ${REPO_URL}
Directory: ${SERVER_DIR}
Fixture: SQLite database at fixture.db

Tasks:
1. Run sandbox-scripts/discover-tools.ts to clone the repo, prepare the fixture, start the server, and list tools.
   Command: npx tsx sandbox-scripts/discover-tools.ts "${REPO_URL}" "${SERVER_DIR}" 3055

2. For EACH tool discovered, spawn a separate Subagent. Assign each subagent a unique port (e.g., 3056, 3057, 3058) and give it these instructions:
   - Run sandbox-scripts/test-tool.ts with your assigned port to safely test the tool against its own isolated fixture copy.
   - Example Command: npx tsx sandbox-scripts/test-tool.ts . <tool_name> fixture.db <port> '<test_input_json>'
   - Return the Evidence JSON to the root agent.

3. After all subagents complete, compile their Evidence.
   Do NOT decide the verdicts yourself.
   
4. Finally, call the \`publish_certification\` tool (from the attest-internal MCP server) with the compiled CertificationReport JSON containing the evidence.
`;

  console.log('\nSending audit instructions:');
  console.log(prompt);

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: 'user.message', content: prompt }],
  });

  console.log('\n--- Streamed Events ---');
  let finalEvidence = '';

  for await (const { data: event } of stream.withMetadata()) {
    if (event.type === 'model.message') {
      if (typeof event.content === 'string') {
        process.stdout.write(event.content);
        finalEvidence += event.content;
      }
    } else if (event.type === 'turn.done') {
      console.log('\n\n✅ Turn complete.');
    } else if (event.type === 'sandbox.created') {
      console.log('\n[Sandbox Created]');
    } else if (event.type === 'tool.approval_required') {
      console.log('\n\n[PAUSED FOR HUMAN APPROVAL]');
      console.log(`The agent wants to call tools: ${event.toolCalls.map((t: any) => t.name).join(', ')}`);
      console.log('Simulating human review... approving in 2 seconds.');
      
      await new Promise(r => setTimeout(r, 2000));
      
      const nextStream = await handleApproval(client, session.id, {
        threadId: event.threadId,
        toolCallId: event.toolCalls[0].id
      }, { allow: true });

      // Continue streaming the resumed turn
      for await (const { data: nextEvent } of nextStream.withMetadata()) {
        if (nextEvent.type === 'model.message' && typeof nextEvent.content === 'string') {
          process.stdout.write(nextEvent.content);
        } else if (nextEvent.type === 'turn.done') {
          console.log('\n\n✅ Turn complete (post-approval).');
        } else if (nextEvent.type === 'tool.response') {
          console.log(`\n[Tool Executed (post-approval): ${nextEvent.toolCallId}]`);
        }
      }
    } else {
      // Optional: log other event types for debugging
      // console.log(`\n[Event: ${event.type}]`);
    }
  }

  console.log('\n--- Final Output ---');
  console.log('Look for the Evidence JSON object above. It should show the audit_log diff!');
}

main().catch((err: Error) => {
  console.error('❌ Audit runner failed:', err.message);
  process.exit(1);
});
