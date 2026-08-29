# Attest — Architecture Documentation

## Overview

Attest is an execution-based MCP server behavior verification system. It
verifies that an MCP server's declared tool annotations (`readOnlyHint`,
`destructiveHint`) match what the tools actually do when executed against a
disposable fixture.

## Why Attest uses TrueForge

Attest needs three things a general web app doesn't normally provide, all at
once: an isolated place to run someone else's untrusted code, an agent that
can reason about which tools to test and how, and a human-approval gate on
the one irreversible action (publishing a certification). Building all three
from scratch (sandbox provisioning, an LLM agent loop, approval/checkpoint
plumbing) would be its own multi-week project. TrueForge already provides
all three as first-class primitives, so Attest is built as a thin
orchestration layer on top of it rather than reimplementing them.

**What TrueForge is responsible for:**
- Provisioning and tearing down the isolated sandbox the target MCP server
  runs in (Daytona-backed)
- Running the agent loop: deciding what to do next, calling tools, spawning
  dynamic subagents for parallel per-tool testing
- Streaming every step of that loop back to Attest as structured events
- Pausing the turn and gating on human approval before `publish_certification`
  ever executes
- Resolving which model answers the agent's reasoning (a config choice, not
  something Attest's code touches — see "Model provider configuration" below)

**What Attest remains responsible for:**
- Deciding what "behaving correctly" means at all: the DECLARED →
  OBSERVED → EVIDENCE → RESULT model (see below)
- The actual before/after state snapshots and diffs (`sandbox-scripts/`) —
  deterministic code, not agent reasoning
- The verdict itself (`packages/verdict-engine`) — a pure function over
  Evidence, the LLM is never asked "is this safe?" and never answers it
- Persistence, the run lifecycle, and the UI

TrueForge is the execution/orchestration layer. Attest is the certification
authority. The agent investigates; it never adjudicates.

## Audit Lifecycle

```
POST /api/audits (repoUrl, serverDir)
  → runAuditSession() [apps/web/lib/engine.ts]
  → registerAuditorAgent(): one TrueForge agent, "attest-auditor"
      manifest built by buildAuditorManifest() [packages/agent-prompts] --
      model name + iteration limit are env-var-driven (ATTEST_MODEL_NAME /
      ATTEST_ITERATION_LIMIT), everything else fixed: sandbox enabled,
      dynamic subagents enabled, publish_certification gated behind
      approval.
  → client.sessions.create() + createTurnStream(prompt)
  → inside the sandbox, the agent:
      0.   confirms/installs Node.js
      0.5. clones the Attest repo itself (sandbox-scripts/ lives there,
           separate from the target server being audited)
      1.   runs discover-tools.ts: clones the TARGET repo, installs deps,
           seeds the fixture, starts the target server, calls tools/list
      2.   spawns one dynamic subagent per discovered tool, each running
           test-tool.ts against its OWN fixture copy and OWN port
      2.5. (optional) if it identifies a real entity relationship between
           tools (e.g. create_X / get_X / delete_X), runs ONE additional
           test-workflow.ts chain -- a sequential, multi-step investigation
           on a separate shared fixture copy (see "Workflow-chain testing")
      3.   compiles all Evidence (isolated + chained) into evidenceArray,
           paired with each tool's declared ToolBehaviorClaim
      4.   calls publish_certification (attest-internal MCP server)
  → every raw TrueForge event is persisted verbatim (turn.created,
    model.message[.delta], sandbox.created, tool.response,
    tool.approval_required, turn.done)
  → tool.approval_required pauses the run -- status: AWAITING_APPROVAL,
    nothing scored yet
  → human clicks Allow/Deny (UI or CLI) → POST /api/audits/[id]/approve
  → finalizeCertification(): NOW, and only now, deriveVerdict() [pure
    function, packages/verdict-engine] scores every (claim, evidence) pair;
    overall_verdict = CERTIFIED / FLAGGED (Allow) / DENIED (Deny)
  → UI polls GET /api/audits/[id] + SSE /events for live progress and the
    final report
```

## Sandbox Architecture

```
Host machine (wherever Attest's own Next.js app runs)
  |
  |--- Attest control plane (Next.js API routes, SQLite)
  |
  |--- TrueForge (local instance, or hosted)
           |
           |--- Daytona sandbox (provisioned per audit turn)
                   |
                   |--- git clone of the TARGET repo (not the host's)
                   |--- npm install (the target's own deps, isolated)
                   |--- disposable SQLite fixture (seeded, never the
                   |     submitter's real data)
                   |--- the target MCP server process itself
                   |--- per-tool fixture COPIES (test-tool.ts) --
                   |     no subagent shares mutable state with another
                   |--- one additional shared fixture copy for the
                         optional workflow-chain test (test-workflow.ts)
```

The target server never runs anywhere but inside that sandbox, against
fixture data Attest itself seeded. It never sees a production system, and
the host machine never executes a line of the submitted code directly.

## Agent Boundaries

The attest-auditor agent can: run shell commands inside its own sandbox,
call the target MCP server over raw HTTP, call `publish_certification`
(gated). It cannot: reach anything on the host machine's filesystem/network,
access Attest's own production SQLite database, or execute
`publish_certification` without a human's explicit Allow. It is also never
asked to judge safety — see "Evidence model" below; if a tool's schema
requires input the agent can't safely construct, its own instructions
(`packages/agent-prompts`) tell it to report `UNSAFE_TO_TEST`, not to
guess.

## Evidence Model: DECLARED → OBSERVED → EVIDENCE → RESULT

For every tool tested (isolated or as part of a workflow chain):

```
DECLARED   readOnlyHint from the server's own tools/list response
OBSERVED   before/after fixture snapshots, captured by test-tool.ts /
           test-workflow.ts around the actual tools/call -- deterministic
           code, not agent judgment
EVIDENCE   the computed diff between those snapshots (table, change type,
           row summary), plus the test input and raw response
RESULT     deriveVerdict(claim, evidence) -- VERIFIED / MISMATCH(severity)
           / UNVERIFIABLE, a pure function, the only place a verdict is
           ever decided
```

Annotations are claims. Observed behavior is evidence. The agent gathers
evidence; it never gets to shortcut to "looks safe."

## Workflow-chain testing (`sandbox-scripts/test-workflow.ts`)

Isolated single-call testing (the original design, still the default for
every tool) catches a mismatch that shows up on its own. It can't catch one
that only appears after a prior step — e.g. a `delete` tool that behaves
correctly against an empty fixture but misbehaves once something has
actually been created and modified. When the auditor agent can identify a
genuine entity relationship between tools (a `create_X` paired with tools
that read/update/delete that same kind of thing), it can additionally run
one chained investigation: several related tool calls against ONE shared
fixture copy, with a snapshot taken after *every* step, producing a
behavioral timeline instead of a single before/after pair.

Each step's Evidence object has the identical shape `test-tool.ts` already
produces, so it scores through the exact same `deriveVerdict()` — this
changes how evidence is *gathered*, never how a verdict is *decided*. This
is optional and additive: it supplements the isolated per-tool tests, it
never replaces them, and the agent skips it entirely when no server has a
meaningful multi-tool relationship to investigate.

## Model provider configuration (and the DGX Spark story)

Attest's own code never hardcodes which model answers the auditor agent's
reasoning — `buildAuditorManifest()` reads `ATTEST_MODEL_NAME` (falling
back to `anthropic/claude-sonnet-4-6`), and that string is resolved
entirely inside TrueForge's own provider settings. This was proven live,
not just designed on paper: mid-development, the configured Anthropic
account had no billing credit, and the agent was switched to a free-tier
Gemini model by changing this one environment variable — zero changes to
any certification, sandbox, or orchestration logic.

The same mechanism is how a local **DGX Spark** inference endpoint would be
used: register it in TrueForge as a `CustomModelProvider`
(`{ type: "custom", baseUrl: "http://<spark-host>:8000/v1", auth, models }`
— a real, installed SDK type, not a hypothetical one), then set
`ATTEST_MODEL_NAME` to point at it. **No Attest code changes required.**

Being honest about what that buys, rather than inventing a GPU story that
doesn't fit this codebase: Attest has no vector search, no batch-processing
pipeline, no compute-bound local workload today, so claiming "faster
embeddings" or "batch certification" here would be fabricated. The real,
defensible benefit is narrower and directly addresses a real problem this
project hit repeatedly during development: **local, private inference with
no per-token cost and no shared rate limit.** Every audit sends the target
repository's source and the agent's full reasoning trace to whichever
model answers it; for a submitter who doesn't want their MCP server's code
leaving their network, or a team running many audits back-to-back, a local
DGX Spark endpoint removes both the privacy exposure and the throughput
ceiling that free-tier cloud models impose (this is not hypothetical — the
Gemini free tier's ~20 requests/minute cap was hit repeatedly running this
exact system). What DGX Spark does **not** currently do for Attest: no GPU
code was written, nothing in the certification path is GPU-accelerated,
and the verdict engine remains, deliberately, a zero-dependency CPU
function — that's a correctness property, not a missed opportunity.

## Cost / Latency Guardrails

`RuntimeConfig.iterationLimit` (a real field in the installed TrueForge
SDK, default 100, max 1024) is explicitly set via `ATTEST_ITERATION_LIMIT`
(default 60 — see `buildAuditorManifest()`) rather than left at TrueForge's
own default. A behavioral audit of a handful of MCP tools has no legitimate
reason to need anywhere near 100 agent-loop iterations; this is a real
ceiling against a runaway or looping turn, not a tuning knob for speed.

Everything that can be decided deterministically already is: state
snapshots, diffs, and the verdict itself never involve a model call. The
model is only used for planning which tools to test and in what sequence
— never for judging whether a result is a mismatch.

## Failure classification

A `FAILED` run status alone conflates very different situations. Every
failure is classified (`apps/web/lib/failure-classification.ts`, a pure,
deterministic function — pattern-matching real observed error text, not an
LLM call) into `TRUEFORGE_UNREACHABLE`, `MODEL_PROVIDER_ERROR`,
`SANDBOX_ERROR`, `SERVER_ERROR`, `TIMEOUT`, or `UNKNOWN`, stored on the run
record (`runs.failure_category`). This distinguishes "the audit couldn't
execute" from "the audit executed and found a real behavioral violation" —
two fundamentally different outcomes that a bare status field can't tell
apart.

## Security Boundary

Attest only executes code the **submitter** provided (the server) against
data the **submitter** provided (the fixture), inside a sandbox neither can
see out of. It never reaches a system Attest's own operator doesn't
control. This does not, and is not claimed to, protect against a
testing-aware adversarial server or a malicious dependency-install step —
a named, honest limitation, not something silently glossed over.

## Verdict Logic

See `packages/verdict-engine/src/derive-verdict.ts` for the implementation.

---

> Full build history and phase-by-phase spec: `Attest_Master_Build_Plan.md`.
> Current-state audit and known issues: `docs/AUDIT_REPORT.md`.
