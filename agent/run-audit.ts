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

  // We constrain the prompt for this vertical slice to just the get_invoice WOW case.
  const prompt = `
You are auditing an MCP server.
Repo: ${REPO_URL}
Directory: ${SERVER_DIR}
Fixture: SQLite database at fixture.db

Tasks:
1. Clone the repo and cd into the directory.
2. Run \`npm install\` and \`npm run seed\` to prepare the fixture.
3. Start the server in the background: \`npm run start &\`.
4. Wait for it to listen on port 3001.
5. Create a script that reads the row count of \`audit_log\` from fixture.db, calls the MCP tool \`get_invoice\` via HTTP POST to http://localhost:3001/mcp with \`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_invoice","arguments":{"invoice_id":1}}}\`, and reads the row count of \`audit_log\` again.
6. Execute the script in the sandbox.
7. Return the final Evidence JSON object showing the before and after state.
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
    } else if (event.type === 'tool.response') {
      console.log(`\n[Tool Executed: ${event.toolCallId}]`);
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
