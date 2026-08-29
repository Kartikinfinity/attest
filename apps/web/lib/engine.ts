import { TrueForge, ConflictError } from '@truefoundry/trueforge-sdk';
import { updateRun, addEvent, saveToolResult, saveEvidence, getRun, getEvents } from './models';
// @ts-ignore
import { deriveVerdict } from '@attest/verdict-engine';
import { AUDITOR_INSTRUCTIONS } from '../../../agent/prompts/auditor.js';

export async function registerAuditorAgent(client: TrueForge): Promise<void> {
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name: 'attest-internal',
      description: 'Internal Attest verification tools',
      type: 'remote',
      url: 'http://localhost:3009/mcp',
    }
  });

  try {
    await client.agents.create({
      name: 'attest-auditor',
      manifest: {
        model: { name: 'anthropic/claude-sonnet-4-6' },
        // Single source of truth for the agent's instructions -- see
        // agent/prompts/auditor.ts. Do not fork a second copy here.
        instructions: AUDITOR_INSTRUCTIONS,
        // Note: no `github` MCP server entry -- cloning is a plain `git
        // clone` inside the sandbox (sandbox-scripts/discover-tools.ts),
        // not an MCP tool call, and an unconfigured entry here blocks
        // registration entirely with a 422.
        mcpServers: [
          { name: 'attest-internal', requireApprovalForTools: ['publish_certification'] },
        ],
        config: {
          sandbox: { enabled: true },
          dynamicSubAgents: { enabled: true },
        },
      }
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      // attest-auditor was already registered by a previous audit run in
      // this TrueForge instance's lifetime. agents.create fails on a
      // duplicate name -- that's expected here on the 2nd+ run, not a bug.
      return;
    }
    throw err;
  }
}

/**
 * Find the most recent `publish_certification` report data captured in this
 * run's event log. The raw report was already persisted by addEvent() when
 * `tool.approval_required` fired -- this just retrieves it, it doesn't
 * re-run any part of the audit.
 */
function extractPendingReport(runId: string): string | null {
  const events = getEvents(runId);
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== 'tool.approval_required') continue;
    const publishCall = event.data?.toolCalls?.find((t: any) => t.name === 'publish_certification');
    if (publishCall?.arguments?.report) return publishCall.arguments.report as string;
  }
  return null;
}

/**
 * Score and persist the certification report -- called only once the
 * human's Allow/Deny decision is known (see approve/route.ts). This is the
 * fix for the approval-timing bug: previously this ran the instant
 * tool.approval_required fired, before any decision existed, so Deny had
 * no visible effect on what was already saved.
 *
 * Per-tool evidence/verdicts are deterministic facts about what was
 * observed, independent of the approval decision, so they're saved either
 * way (useful for the reviewer to see why they denied). `overall_verdict`
 * represents whether the certification was actually PUBLISHED, which only
 * happens on Allow -- on Deny it's explicitly 'DENIED', never
 * CERTIFIED/FLAGGED.
 */
export function finalizeCertification(runId: string, allow: boolean): void {
  const reportJson = extractPendingReport(runId);
  if (!reportJson) return;

  try {
    const reportData = JSON.parse(reportJson);
    let mismatches = 0;

    if (reportData.claims && reportData.evidence) {
      for (let i = 0; i < reportData.claims.length; i++) {
        const claim = reportData.claims[i];
        const evidence = reportData.evidence[i];
        saveEvidence(runId, claim.toolName, evidence);

        const verdict = deriveVerdict(claim, evidence);
        const severity = verdict.kind === 'MISMATCH' ? (verdict as any).severity : null;
        saveToolResult(runId, claim.toolName, claim.declaredReadOnly ?? null, verdict.kind, severity);

        if (verdict.kind === 'MISMATCH') mismatches++;
      }
    }

    updateRun(runId, { overall_verdict: allow ? (mismatches > 0 ? 'FLAGGED' : 'CERTIFIED') : 'DENIED' });
  } catch (e) {
    console.error('Failed to parse report while finalizing certification', e);
  }
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

    // Preflight: confirm TrueForge itself is reachable before doing anything
    // else. Without this, an unreachable TrueForge surfaces many steps later
    // as a bare "fetch failed" (a raw Node connection error with no context),
    // which is indistinguishable from every other possible failure in the
    // events log. This does not change audit behavior, verdict logic, the
    // raw-HTTP/sandbox design, or approval gating in any way — it only makes
    // this one failure mode diagnosable instead of opaque.
    try {
      await client.agents.list();
    } catch (preflightErr: any) {
      throw new Error(
        `Cannot reach TrueForge at ${baseUrl}. Start it with "npx @truefoundry/trueforge@latest" ` +
        `and confirm it is listening before submitting an audit. ` +
        `(underlying error: ${preflightErr?.message ?? String(preflightErr)})`
      );
    }

    await registerAuditorAgent(client);

    const { data: session } = await client.sessions.create({
      agent: { name: 'attest-auditor' },
    });
    
    updateRun(runId, { session_id: session.id });

    const prompt = `You are auditing an MCP server.
Repo: ${repoUrl}
Directory: ${serverDir}
Fixture: SQLite database at fixture.db

A note on this sandbox: each command you run may start in a fresh shell with no
memory of a previous "cd". Do NOT rely on an earlier "cd" persisting. Every
command below must be run using its full path or prefixed with
"cd /home/trueforge/attest-runner && ...".

Tasks:
0. Before anything else, confirm Node.js and npx are available in this sandbox:
   Command: node --version && npx --version
   If either command is not found, install Node.js first using whatever package
   manager is available (e.g. apt-get install -y nodejs npm, or curl -fsSL
   https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs),
   then re-run the version check to confirm before proceeding.

0.5. The scripts referenced below (sandbox-scripts/discover-tools.ts,
   sandbox-scripts/test-tool.ts) are NOT already present in this sandbox --
   they live in the Attest project's own repo, which must be cloned first,
   separately from the target server being audited.
   Command: git clone "${repoUrl}" /home/trueforge/attest-runner
   All commands in steps 1-4 below must run with /home/trueforge/attest-runner
   as their working directory.

1. Run sandbox-scripts/discover-tools.ts to clone the repo, prepare the fixture, start the server, and list tools.
   Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/discover-tools.ts "${repoUrl}" "${serverDir}" 3055

2. For EACH tool discovered, spawn a separate Subagent. Assign each subagent a unique port (e.g., 3056, 3057, 3058) and give it these instructions:
   - Run sandbox-scripts/test-tool.ts with your assigned port to safely test the tool against its own isolated fixture copy.
   - Example Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/test-tool.ts .sandbox-tmp/repo/${serverDir} <tool_name> .sandbox-tmp/repo/${serverDir}/fixture.db <port> '<test_input_json>'
   - Return the Evidence JSON to the root agent.

3. After all subagents complete, compile their Evidence into a JSON array called \`evidenceArray\`.
   For each evidence, ensure you pair it with the corresponding \`ToolBehaviorClaim\` (from the discover-tools.ts output).

4. Finally, call the \`publish_certification\` tool (from the attest-internal MCP server) with a JSON string containing \`{ evidence: evidenceArray, claims: claimsArray }\`.`;

    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ type: 'user.message', content: prompt }],
    });

    async function consumeStream(currentStream: any) {
      for await (const { data: event } of currentStream.withMetadata()) {
        addEvent(runId, event.type, event);

        if (event.type === 'tool.approval_required') {
          // Note: verdicts/evidence are intentionally NOT computed or
          // persisted here. The report data is already captured by the
          // addEvent() call above (it's part of this raw event); actual
          // scoring happens in finalizeCertification(), called only after
          // the human's Allow/Deny decision is known -- see approve/route.ts
          // and the D.3 fix in AUDIT_REPORT.md. Computing/saving a verdict
          // before the decision exists would make Deny a no-op.
          updateRun(runId, { status: 'AWAITING_APPROVAL' });
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
