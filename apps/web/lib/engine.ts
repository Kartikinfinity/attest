import { TrueForge } from '@truefoundry/trueforge-sdk';
import { updateRun, addEvent, saveToolResult, saveEvidence, getRun, getEvents } from './models';
// @ts-ignore
import { deriveVerdict } from '@attest/verdict-engine';
import { buildAuditorManifest } from '@attest/agent-prompts';
import { classifyFailure } from './failure-classification';

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
      // Manifest comes from the single shared builder in
      // packages/agent-prompts -- see buildAuditorManifest() there. This
      // used to be a second, independently-drifting copy of the manifest
      // (previously the actual source of the D.1 instructions-drift bug).
      // Model name and iteration limit are env-var-driven
      // (ATTEST_MODEL_NAME / ATTEST_ITERATION_LIMIT), so if you're
      // running on the free-tier Gemini model while Anthropic billing is
      // pending, set ATTEST_MODEL_NAME=google-gemini/gemini-3-6-flash in
      // .env rather than editing code -- see .env.example.
      manifest: buildAuditorManifest(),
    });
  } catch (err: any) {
    // agents.create() throws the SDK's ConflictError (HTTP 409) when
    // attest-auditor was already registered by a previous audit run in
    // this TrueForge instance's lifetime -- that's expected on the 2nd+
    // run, not a bug. Checked via statusCode rather than `instanceof
    // ConflictError`: the SDK's ESM build (what Next.js's webpack
    // resolves, vs. the CJS build Node/tsx resolves on the CLI path)
    // doesn't re-export that class under this package version, which
    // broke the web app's build entirely -- statusCode is a plain
    // property on the shared TrueForgeError base class, so it's reliable
    // regardless of which build got resolved.
    if (err?.statusCode === 409) {
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

/**
 * Cancel a running audit.
 *
 * This is a real cancellation, not a cosmetic status flip: it calls
 * TrueForge's sessions.cancel(), which stops the running turn server-side,
 * then records the outcome locally. Without it a wedged agent (one looping
 * on retries, say) leaves a run showing "Running" forever with no way for
 * an operator to stop it.
 *
 * CANCELLED is deliberately its own status rather than being folded into
 * FAILED -- "a human stopped this" and "this broke" are different
 * outcomes, and the run's partial evidence stays valid and worth reading
 * either way.
 */
export async function cancelAuditSession(runId: string): Promise<void> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  // Terminal runs stay as they are -- cancelling a finished audit is a
  // no-op, not an error worth surfacing to the caller.
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
    return;
  }

  if (run.session_id) {
    try {
      const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
      const client = new TrueForge({ baseUrl });
      await client.sessions.cancel(run.session_id, {});
    } catch (err: any) {
      // Still mark it cancelled locally. If TrueForge is unreachable or the
      // turn already ended, the operator's intent ("stop showing this as
      // running") is what matters -- failing here would leave the run stuck
      // in exactly the state they were trying to escape.
      console.error('sessions.cancel failed; marking cancelled locally anyway:', err?.message);
      addEvent(runId, 'error', {
        message: `Cancel requested, but TrueForge's sessions.cancel failed: ${err?.message ?? String(err)}. The run was marked cancelled locally; the agent turn may still be finishing server-side.`,
      });
    }
  }

  addEvent(runId, 'audit.cancelled', { message: 'Audit cancelled by operator.' });
  updateRun(runId, { status: 'CANCELLED' });
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

=== RULES — these override your own judgment about what would be helpful ===

R1. DO NOT read, cat, open, or grep the target server's source code. You are
    auditing OBSERVED BEHAVIOR, not source. Reading the implementation would
    let you infer what a tool "should" do instead of recording what it
    actually did, which invalidates the entire audit. The only things you may
    read are the JSON outputs of the scripts listed below.

R2. DO NOT start, stop, or manage the target server yourself. Do not run
    "npm run start", do not background processes, do not check PIDs, do not
    curl the server directly. sandbox-scripts/test-tool.ts and
    test-workflow.ts each start and stop their own server internally. Manual
    server management is the single most common way this audit goes wrong.

R3. A command may fail with "command execution timeout" (the sandbox enforces
    a ~60s ceiling per command). If that happens, DO NOT immediately re-run
    the same command. First re-read the output you already have: these
    scripts print their result before finishing, so the evidence may already
    be present. Only retry if there is genuinely no output, and retry a given
    command AT MOST ONCE.

R4. Once a tool has produced an "--- EVIDENCE JSON ---" block, that tool is
    DONE. Never test it a second time. Record the evidence and move on.

R5. When every discovered tool has one evidence object, go straight to the
    final step and call publish_certification. Do not do additional
    exploration, verification, or tidying first. Finishing is the goal.

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

2.5. Optional -- only if genuinely applicable: look at the tool names/schemas from step 1. If several tools clearly share one entity (e.g. a tool that creates something alongside tools that read/update/delete that same kind of thing), run ONE additional workflow-chain test using sandbox-scripts/test-workflow.ts on its own fresh fixture copy and port. This calls the related tools in a realistic sequence against ONE shared fixture copy (not isolated per-call), which can reveal a mismatch that only shows up after a prior step.
   Command: cd /home/trueforge/attest-runner && npx tsx sandbox-scripts/test-workflow.ts .sandbox-tmp/repo/${serverDir} .sandbox-tmp/repo/${serverDir}/fixture.db <port> '[{"toolName":"...","args":{...}}, {"toolName":"...","args":{...}}]'
   This prints a WORKFLOW EVIDENCE JSON array -- one Evidence object per step, in the exact same shape test-tool.ts produces. Skip this step entirely if no meaningful multi-tool relationship exists for this server -- it supplements the per-tool tests in step 2, it never replaces them.

3. After all subagents (and the workflow-chain test, if you ran one) complete, compile ALL of their Evidence into a JSON array called \`evidenceArray\`.
   For each evidence entry, ensure you pair it with the corresponding \`ToolBehaviorClaim\` (from the discover-tools.ts output), matched by toolName. A tool tested both in isolation and as part of a chain will legitimately produce two separate (claim, evidence) pairs -- include both.

4. Finally, call the \`publish_certification\` tool (from the attest-internal MCP server) with a JSON string containing \`{ evidence: evidenceArray, claims: claimsArray }\`.`;

    const stream = await client.sessions.createTurnStream(session.id, {
      input: [{ type: 'user.message', content: prompt }],
    });

    async function consumeStream(currentStream: any) {
      for await (const { data: event } of currentStream.withMetadata()) {
        // Skip token-streaming fragments. These are assembly artifacts of
        // the model's output, not audit events: the completed text arrives
        // separately as model.message, and nothing in the UI reads deltas.
        // Persisting them was 81% of the event log by count (619 of 765 on
        // one real run) and 149KB of the 250KB payload -- written to SQLite,
        // pushed over SSE, accumulated in React state, and rendered in the
        // raw log, for no informational gain.
        if (!event.type.endsWith('.delta')) {
          addEvent(runId, event.type, event);
        }

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
          // A provider/model-level failure (e.g. a rate limit or billing
          // error from the underlying LLM) surfaces as DATA inside this
          // event (event.state.status === 'error'), not as a thrown JS
          // exception -- the stream just ends normally either way. Without
          // this check, the run falls through to the unconditional
          // "still RUNNING -> COMPLETED" update below regardless of
          // whether the turn actually succeeded, which is misleading for
          // a tool whose whole premise is trustworthy status reporting.
          if (event.state?.status === 'error') {
            const message = event.state?.message ?? 'Turn ended with an error';
            updateRun(runId, { status: 'FAILED', failure_category: classifyFailure(message) });
            addEvent(runId, 'error', { message });
          }
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
    updateRun(runId, { status: 'FAILED', failure_category: classifyFailure(err.message) });
    addEvent(runId, 'error', { message: err.message });
  }
}
