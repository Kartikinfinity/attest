import { TrueForge } from '@truefoundry/trueforge-sdk';
import { updateRun, addEvent, saveToolResult, saveEvidence, getRun } from './models';
// @ts-ignore
import { deriveVerdict } from '@attest/verdict-engine';

export async function registerAuditorAgent(client: TrueForge): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name: 'attest-internal',
      description: 'Internal Attest verification tools',
      type: 'remote',
      url: 'http://localhost:3009/mcp',
    }
  });

  await client.agents.create({
    name: 'attest-auditor',
    manifest: {
      model: { name: 'anthropic/claude-sonnet-4-6' },
      instructions: 'You are an MCP auditor...', 
      mcpServers: [
        { name: 'github', enableTools: ['@read-only'] },
        { name: 'attest-internal', requireApprovalForTools: ['publish_certification'] },
      ],
      config: {
        sandbox: { enabled: true },
        dynamicSubAgents: { enabled: true },
      },
    }
  });
}

export async function handleApproval(
  client: TrueForge,
  sessionId: string,
  pendingApproval: { threadId: string; toolCallId: string },
  decision: { allow: boolean; reason?: string }
) {
  return await client.sessions.createTurnStream(sessionId, {
    input: [
      {
        type: 'user.tool_approval',
        threadId: pendingApproval.threadId,
        toolCallId: pendingApproval.toolCallId,
        approval: decision.allow
          ? { status: 'allow' }
          : { status: 'deny', reason: decision.reason ?? 'Denied by reviewer' }
      }
    ]
  });
}

export async function runAuditSession(runId: string, repoUrl: string, serverDir: string) {
  try {
    updateRun(runId, { status: 'RUNNING' });
    const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
    const client = new TrueForge({ baseUrl });

    await registerAuditorAgent(client);

    const { data: session } = await client.sessions.create({
      agent: { name: 'attest-auditor' },
    });
    
    updateRun(runId, { session_id: session.id });

    // Note: Template literal avoids escaping issues
    const prompt = 'You are auditing an MCP server.\\nRepo: ' + repoUrl + '\\nDirectory: ' + serverDir + '\\nFixture: SQLite database at fixture.db\\n\\nTasks:\\n1. Run sandbox-scripts/discover-tools.ts to clone the repo, prepare the fixture, start the server, and list tools.\\n   Command: npx tsx sandbox-scripts/discover-tools.ts "' + repoUrl + '" "' + serverDir + '" 3055\\n\\n2. For EACH tool discovered, spawn a separate Subagent. Assign each subagent a unique port (e.g., 3056, 3057, 3058) and give it these instructions:\\n   - Run sandbox-scripts/test-tool.ts with your assigned port to safely test the tool against its own isolated fixture copy.\\n   - Example Command: npx tsx sandbox-scripts/test-tool.ts .sandbox-tmp/repo/' + serverDir + ' <tool_name> .sandbox-tmp/repo/' + serverDir + '/fixture.db <port> \'<test_input_json>\'\\n   - Return the Evidence JSON to the root agent.\\n\\n3. After all subagents complete, compile their Evidence into a JSON array called `evidenceArray`.\\n   For each evidence, ensure you pair it with the corresponding `ToolBehaviorClaim` (from the discover-tools.ts output).\\n   \\n4. Finally, call the `publish_certification` tool (from the attest-internal MCP server) with a JSON string containing `{ evidence: evidenceArray, claims: claimsArray }`.';

    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ type: 'user.message', content: prompt }],
    });

    async function consumeStream(currentStream: any) {
      for await (const { data: event } of currentStream.withMetadata()) {
        addEvent(runId, event.type, event);

        if (event.type === 'tool.approval_required') {
          updateRun(runId, { status: 'AWAITING_APPROVAL' });
          
          const publishCall = event.toolCalls.find((t: any) => t.name === 'publish_certification');
          if (publishCall && publishCall.arguments && publishCall.arguments.report) {
            try {
              const reportData = JSON.parse(publishCall.arguments.report);
              let mismatches = 0;
              let verified = 0;
              let failed = 0;
              let unverifiable = 0;
              
              if (reportData.claims && reportData.evidence) {
                for (let i = 0; i < reportData.claims.length; i++) {
                  const claim = reportData.claims[i];
                  const evidence = reportData.evidence[i];
                  saveEvidence(runId, claim.toolName, evidence);
                  
                  const verdict = deriveVerdict(claim, evidence);
                  const severity = verdict.kind === 'MISMATCH' ? (verdict as any).severity : null;
                  saveToolResult(runId, claim.toolName, claim.declaredReadOnly ?? null, verdict.kind, severity);
                  
                  if (verdict.kind === 'MISMATCH') mismatches++;
                  else if (verdict.kind === 'VERIFIED') verified++;
                  else if (verdict.kind === 'UNVERIFIABLE') unverifiable++;
                }
              }

              const overallVerdict = mismatches > 0 ? 'FLAGGED' : 'CERTIFIED';
              updateRun(runId, { overall_verdict: overallVerdict });
              
            } catch (e) {
              console.error("Failed to parse report in approval hook", e);
            }
          }
          return;
        } else if (event.type === 'turn.done') {
        }
      }
    }

    await consumeStream(stream);

    const r = getRun(runId);
    if (r?.status === 'RUNNING') {
      updateRun(runId, { status: 'COMPLETED' });
    }

  } catch (err: any) {
    console.error("Audit session failed:", err);
    updateRun(runId, { status: 'FAILED' });
    addEvent(runId, 'error', { message: err.message });
  }
}
