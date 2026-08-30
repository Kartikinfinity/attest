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

0. BOOTSTRAP -- run these in exactly this order. Installing packages before
   the C++ toolchain exists corrupts the dependency tree, and installing the
   whole monorepo runs the sandbox out of memory.

   0a. node --version && npm --version
       If missing: curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
   0b. apt-get install -y python3 make g++      (BEFORE any npm install --
       better-sqlite3 compiles from source; without this you get "gyp ERR!")
   0c. git clone "${REPO_URL}" /home/trueforge/attest-runner
   0d. cd /home/trueforge/attest-runner/sandbox-scripts && npm install --no-audit --no-fund
       Do NOT run npm install at /home/trueforge/attest-runner -- that pulls
       in the whole monorepo and gets OOM-killed ("Killed / EXIT: 137"),
       leaving broken packages like "@esbuild/linux-x64 could not be found".
   0e. cd /home/trueforge/attest-runner/sandbox-scripts && npx tsx --version
       If it prints a version, continue. If not, retry 0b then 0d ONCE, then
       continue regardless -- do not loop here.

   All commands below run from /home/trueforge/attest-runner/sandbox-scripts
   and use ABSOLUTE paths for everything else.

1. Discover the target server's tools (clones, installs, seeds, starts, lists):
   Command: cd /home/trueforge/attest-runner/sandbox-scripts && npx tsx discover-tools.ts "${REPO_URL}" "${SERVER_DIR}" 3055

   The target checkout lands at:
   /home/trueforge/attest-runner/sandbox-scripts/.sandbox-tmp/repo/${SERVER_DIR}
   Call that TARGET_DIR and use it below.

2. Run ALL tool tests with ONE background command. Do NOT spawn a subagent
   per tool and do NOT run them in the foreground -- a single tool test does
   not reliably fit inside the sandbox's ~60s per-command ceiling, so
   foreground runs time out and retrying them burns the whole budget.

   Build one entry per discovered tool, with a minimal schema-valid input:
   [{"toolName":"...","args":{...}}, ...]

   Launch in the BACKGROUND (returns immediately):
   cd /home/trueforge/attest-runner/sandbox-scripts && rm -f /tmp/attest-evidence.json && nohup npx tsx run-all-tools.ts <TARGET_DIR> <TARGET_DIR>/fixture.db 3100 '<toolsJson>' /tmp/attest-evidence.json > /tmp/attest-audit.log 2>&1 & echo launched

   Each tool still gets its OWN fixture copy and OWN port.

3. Poll for completion, ~15s apart, with this exact command:
   test -f /tmp/attest-evidence.json && echo READY || tail -3 /tmp/attest-audit.log
   READY means done. The file is written in one shot at the end, so if it
   exists it is complete. Give up after ~10 polls and continue anyway.

4. Read it and publish:
   cat /tmp/attest-evidence.json
   Take the evidence array, pair each entry with its ToolBehaviorClaim from
   step 1 by toolName, and call the publish_certification tool (from the
   attest-internal MCP server) with the compiled CertificationReport JSON.
   Do NOT decide verdicts yourself. Publish without further exploration.
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
