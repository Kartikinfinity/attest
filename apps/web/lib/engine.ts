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
    if (err?.statusCode !== 409) throw err;

    // The agent already exists. Do NOT just return -- the existing agent
    // still carries whatever manifest it was created with, possibly days
    // ago. Its instructions and model are then permanently stale: editing
    // AUDITOR_INSTRUCTIONS or ATTEST_MODEL_NAME would have no effect, and
    // the audit would keep running against the old system prompt with no
    // indication anything was ignored. This was a real failure -- an agent
    // registered before the "never read the target's source" rule existed
    // kept reading source and never converged.
    //
    // agents.create's name is immutable but agents.update replaces the
    // manifest for an existing agent id, so reconcile it instead.
    try {
      const { data: agents } = await client.agents.list();
      const existing = agents.find((a: any) => a.name === 'attest-auditor');
      if (existing) {
        await client.agents.update(existing.id, { manifest: buildAuditorManifest() });
      }
    } catch (updateErr: any) {
      // Reconciliation is best-effort: an audit against a slightly stale
      // agent is far better than no audit at all, so this must not be fatal.
      console.error('Could not reconcile existing attest-auditor manifest:', updateErr?.message);
    }
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

0. BOOTSTRAP -- run these commands in exactly this order. Do not improvise a
   different order: installing packages before the C++ toolchain exists is
   what corrupts the dependency tree, and installing the whole monorepo runs
   the sandbox out of memory.

   0a. Check for Node:
       node --version && npm --version
       If "node: command not found", install it:
       curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

   0b. Install the build toolchain BEFORE any npm install. better-sqlite3 is
       a native module and compiles from source here; without this, npm
       install fails with "gyp ERR!" and leaves a half-written node_modules
       that breaks every later command:
       apt-get install -y python3 make g++

   0c. Clone this project (it holds the audit scripts -- separate from the
       server being audited):
       git clone "${repoUrl}" /home/trueforge/attest-runner

   0d. Install ONLY the audit scripts' own dependencies. Use this exact
       command. Do NOT run npm install at /home/trueforge/attest-runner --
       that installs the entire monorepo (Next.js, React, vitest, eslint)
       and the sandbox will OOM-kill it, which shows up as
       "Killed / EXIT: 137" followed by missing-package errors like
       "@esbuild/linux-x64 could not be found":
       cd /home/trueforge/attest-runner/sandbox-scripts && npm install --no-audit --no-fund

   0e. Confirm the bootstrap worked before continuing:
       cd /home/trueforge/attest-runner/sandbox-scripts && npx tsx --version
       If that prints a version, the bootstrap is done. If it fails, re-run
       0b then 0d once more, then continue regardless -- do not loop here.

   IMPORTANT: every command in steps 1-4 runs from
   /home/trueforge/attest-runner/sandbox-scripts (that is where the
   dependencies now live), and uses ABSOLUTE paths for everything else.

1. Discover the target server's tools. This clones the target, installs it,
   seeds its fixture, starts it, and calls tools/list:
   Command: cd /home/trueforge/attest-runner/sandbox-scripts && npx tsx discover-tools.ts "${repoUrl}" "${serverDir}" 3055

   This creates the target checkout at:
   /home/trueforge/attest-runner/sandbox-scripts/.sandbox-tmp/repo/${serverDir}
   Use that absolute path (call it TARGET_DIR) in the steps below.

2. Run ALL the tool tests with ONE background command. Do NOT spawn one
   subagent per tool and do NOT run the tests in the foreground: a single
   tool test does not reliably finish inside the sandbox's ~60s per-command
   ceiling, so foreground runs time out, and retrying them is what causes an
   audit to burn its entire budget without finishing.

   Build a JSON array of one entry per discovered tool, each with a minimal,
   schema-valid input based on the inputSchema from step 1:
   [{"toolName":"...","args":{...}}, ...]

   Then launch it in the BACKGROUND (this returns immediately):
   cd /home/trueforge/attest-runner/sandbox-scripts && rm -f /tmp/attest-evidence.json && nohup npx tsx run-all-tools.ts <TARGET_DIR> <TARGET_DIR>/fixture.db 3100 '<toolsJson>' /tmp/attest-evidence.json > /tmp/attest-audit.log 2>&1 & echo launched

   This tests every tool against its OWN fixture copy on its OWN port, the
   same isolation the per-tool script uses, and writes one result file.

3. Poll for completion. Wait roughly 15 seconds between polls, and run this
   exact command each time:
   test -f /tmp/attest-evidence.json && echo READY || tail -3 /tmp/attest-audit.log

   - If it prints READY, go to step 4.
   - Otherwise it prints recent progress lines; poll again.
   - The result file is written in a single operation at the very end, so if
     it exists it is complete -- never try to parse a partial file.
   - Give up only after about 10 polls, and then go to step 4 anyway using
     whatever the log shows.

4. Read the evidence, then publish:
   cat /tmp/attest-evidence.json

   That file is {"status":"complete","evidence":[...],"errors":[...]}. Take
   its \`evidence\` array. Pair each entry with the matching ToolBehaviorClaim
   from step 1 (match on toolName; a claim is the tool's declared
   annotations, e.g. readOnlyHint). Any tool listed in \`errors\` simply has no
   evidence -- report it, do not retry it.

   Then call the \`publish_certification\` tool (from the attest-internal MCP
   server) with a JSON string containing
   \`{ evidence: evidenceArray, claims: claimsArray }\`.

   Do NOT do any further exploration before publishing. Publishing is the
   goal, and it pauses for a human to approve -- that pause is expected.`;

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
