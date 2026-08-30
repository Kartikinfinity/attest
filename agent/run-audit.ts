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

A note on this sandbox: each command you run may start in a fresh shell with no
memory of a previous "cd". Do NOT rely on a earlier "cd" persisting. Every command
below must be run using its full path or prefixed with "cd /home/trueforge/attest-runner && ...".

Tasks:
0. Before anything else, confirm Node.js and npx are available in this sandbox:
   Command: node --version && npx --version
   If either command is not found, install Node.js first using whatever package manager
   is available (e.g. apt-get install -y nodejs npm, or curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs),
   then re-run the version check to confirm before proceeding.

0.5. The scripts referenced below (sandbox-scripts/discover-tools.ts, sandbox-scripts/test-tool.ts)
   are NOT already present in this sandbox — they live in the Attest project's own repo, which must
   be cloned first, separately from the target server being audited.
   Command: git clone "${REPO_URL}" /home/trueforge/attest-runner
   All commands in steps 1-4 below must run with /home/trueforge/attest-runner as their working
   directory (e.g. "cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/discover-tools.ts ...").

1. Run sandbox-scripts/discover-tools.ts to clone the repo, prepare the fixture, start the server, and list tools.
   Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/discover-tools.ts "${REPO_URL}" "${SERVER_DIR}" 3055

2. For EACH tool discovered, spawn a separate Subagent. Assign each subagent a unique port (e.g., 3056, 3057, 3058) and give it these instructions:
   - Run sandbox-scripts/test-tool.ts with your assigned port to safely test the tool against its own isolated fixture copy.
   - Example Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/test-tool.ts .sandbox-tmp/repo/${SERVER_DIR} <tool_name> .sandbox-tmp/repo/${SERVER_DIR}/fixture.db <port> '<test_input_json>'
   - Return the Evidence JSON to the root agent.

2.5. Optional -- only if genuinely applicable: look at the tool names/schemas from step 1. If several tools clearly share one entity (e.g. a tool that creates something alongside tools that read/update/delete that same kind of thing), run ONE additional workflow-chain test using sandbox-scripts/test-workflow.ts on its own fresh fixture copy and port. This calls the related tools in a realistic sequence against ONE shared fixture copy, which can reveal a mismatch that only shows up after a prior step.
   Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/test-workflow.ts .sandbox-tmp/repo/${SERVER_DIR} .sandbox-tmp/repo/${SERVER_DIR}/fixture.db <port> '[{"toolName":"...","args":{...}}, {"toolName":"...","args":{...}}]'
   Skip this step entirely if no meaningful multi-tool relationship exists -- it supplements step 2, it never replaces it.

3. After all subagents (and the workflow-chain test, if you ran one) complete, compile their Evidence.
   Do NOT decide the verdicts yourself.

4. Finally, call the \`publish_certification\` tool (from the attest-internal MCP server) with the compiled CertificationReport JSON containing the evidence.
`;

  console.log('\nSending audit instructions:');
  console.log(prompt);

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{ type: 'user.message', content: prompt }],
  });

  console.log('\n--- Streamed Events ---');

  async function consumeStream(currentStream: any) {
    for await (const { data: event } of currentStream.withMetadata()) {
      if (event.type === 'model.message') {
        if (typeof event.content === 'string') {
          process.stdout.write(event.content);
        }
      } else if (event.type === 'turn.done') {
        console.log('\n\n✅ Turn complete.');
      } else if (event.type === 'sandbox.created') {
        console.log('\n[Sandbox Created]');
      } else if (event.type === 'tool.response') {
        console.log(`\n[Tool Executed: ${event.toolCallId}]`);
      } else if (event.type === 'tool.approval_required') {
        console.log('\n\n[PAUSED FOR HUMAN APPROVAL]');
        console.log(`The agent wants to call tools: ${event.toolCalls.map((t: any) => t.name).join(', ')}`);
        
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        
        const answer = await new Promise<string>(resolve => {
          rl.question('Approve this tool call? (y/n): ', resolve);
        });
        rl.close();

        const allow = answer.trim().toLowerCase() === 'y';
        if (!allow) {
          console.log('Denying tool call...');
        } else {
          console.log('Approving tool call...');
        }

        let currentThreadStream = null;
        for (const toolCall of event.toolCalls) {
          currentThreadStream = await handleApproval(client, session.id, {
            threadId: event.threadId,
            toolCallId: toolCall.id
          }, { allow, reason: allow ? undefined : 'User denied' });
        }

        // Recursively consume the resumed stream from the last approval
        if (currentThreadStream) {
          await consumeStream(currentThreadStream);
        }
      }
    }
  }

  await consumeStream(stream);

  console.log('\n--- Final Output ---');
  console.log('Look for the Evidence JSON object above. It should show the audit_log diff!');
}

main().catch((err: Error) => {
  console.error('❌ Audit runner failed:', err.message);
  process.exit(1);
});
