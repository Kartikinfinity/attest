# ATTEST — MASTER BUILD PLAN

**TrueForge Agent Harness Hackathon | 4.5-Day From-Zero Build Plan**
**Prepared:** Wednesday, August 26, 2026, morning · Submission: Sunday, August 30
**Labels used throughout:** **FACT** (verified this pass, against a live source or TrueForge's own cloned repository) · **PHASE-4** (carried from the prior research report) · **ENGINEERING RECOMMENDATION** (my judgment) · **HYPOTHESIS** (unverified, flagged as such)

---

## 0. Executive Decision

**Build Attest, as Phase 4 concluded — no blocker found that changes the product thesis.** One real architecture correction surfaced this pass, and it's a good one, not a bad one: it makes the design *more* correct, not less feasible.

**FACT, verified directly against TrueForge's own agent-spec schema (read from the cloned repository this pass):** an agent's `mcp_servers` field attaches a server *by name*, and that name must refer to something already registered under **Settings → Connectors**. There is no inline "attach this arbitrary URL as an MCP server for this one turn" mechanism. This confirms — with primary-source certainty, where Phase 4 had only inferred it — that Attest **cannot** register each newly-submitted MCP server as a proper TrueForge connector per run; doing so for every submission would mean a slow, stateful registration step for a server you'll test once and discard. **Phase 4 said** Attest should drive the submitted server via raw HTTP calls from inside Code Mode rather than TrueForge's own MCP-attachment mechanism. **Current source confirms this was the right call, for a reason Phase 4 hadn't yet nailed down as precisely:** it isn't just cleaner, it's the *only* mechanism that fits how `mcp_servers` actually works. No architecture change needed — a confirmation, upgraded from inference to fact.

A second, smaller correction, in your favor: **Phase 4 said** the target server could run as a "Daytona background process session." **Current source indicates** that specific named API is a Daytona-SDK-level feature for code managing a sandbox *from outside it* — not something confirmed to be exposed to an agent working *inside* a TrueForge-provisioned sandbox through the harness's own exec tool. **Therefore the architecture should change from** "call a special background-session primitive" **to** standard shell process backgrounding (`nohup server & `, then poll it with a later exec call in the same session) — which works because sandbox state and running processes persist across exec calls within one session's sandbox (Phase 1 §6, FACT). Simpler, more standard, equally reliable, nothing lost.

---

## 1. Official Hackathon Requirements

Verified verbatim against `wemakedevs.org/hackathons/trueforge` and its `/rules` page one day ago (Phase 3, this same project) — re-checked for drift this pass; nothing found suggesting a change in ~24 hours, so this is carried forward as still current rather than re-fetched line by line.

| Requirement | Detail | Source |
|---|---|---|
| Qualifying gate | TrueForge must be doing real, visible work — a real tool reached, real sandbox code run, a real pause before anything irreversible | Rules page, FACT |
| Six equally-weighted criteria | Potential impact, Creativity/originality, Technical excellence, Use of sponsor tools (TrueForge depth **and** Qodo-reviewed PRs), Control and safety, Presentation | Rules page, FACT |
| Three tracks, one winnable per team | Best Use of TrueForge (DGX Spark), Best Code Quality (Mac Mini — **requires** Qodo-reviewed PR history), Best UI (iPad, every member — judged on demo **and** the running project) | Rules page, FACT |
| Submission artifacts | Public repo, README a stranger can run, ~3-minute demo, short write-up | Rules page, FACT |
| Build window | Aug 24 08:00 → Aug 30 20:00 (London); planning beforehand is fine | Rules page, FACT |
| "Yours to touch" | Only connect tools/data/accounts you own or have permission for | Rules page, FACT |
| AI-assistant disclosure | Allowed, must be disclosed; you must be able to explain your own submission; **fully AI-generated submissions with no meaningful participant understanding may be rejected** | Rules page, FACT — this is the rule that matters most for *you specifically*, given how much of this plan is AI-assisted. Build in the understanding checkpoints this plan gives you; don't skip them. |
| Qodo | Rules/FAQ: required only to win Best Code Quality. Main landing page's checklist lists it without that caveat. **Install it from day one regardless** — resolves the inconsistency in the only safe direction. | Rules + main page, FACT (inconsistency), ENGINEERING RECOMMENDATION (resolution) |

**One-product-many-tracks strategy:** Attest is naturally strong across all three simultaneously — deep TrueForge usage (Best Use), a real evidence-diff UI with a mismatch that's "impossible to miss" (Best UI), and a disciplined, Qodo-reviewed PR trail from commit one (Best Code Quality) — so the plan below builds one thing well rather than three thin things.

---

## 2. Phase-4 Findings We Are Carrying Forward

- **The thesis:** verify a claim by *executing* it, not by reading source or judging plausibility — the one mechanism-level edge that survived adversarial competitive research (PHASE-4).
- **The exact gap:** static MCP-annotation checkers exist (a checklist, a pattern-catalog product, a published skill) — none found actually call the tool and observe real effects (PHASE-4).
- **The WOW case:** a `get_invoice` tool declared `readOnlyHint: true` that secretly appends to an audit log — a realistic, not contrived, planted mismatch (PHASE-4).
- **The honest failure risk already identified:** do not scope-creep into probing third-party production servers — MVP tests *submitted* servers against *disposable fixtures the submitter provides*, like CI tests a PR, not like a scanner crawling the internet (PHASE-4).
- **The verdict categories, evidence model, and the "gate the certification, not the finding" approval rationale** — carried forward largely as-is; refined in §11.

---

## 3. Current Research Updates

Per the instruction: nothing below is a silent change. Each line names what Phase 4 said, what was found this pass, and what changes.

| Phase 4 said | Current source indicates | Therefore |
|---|---|---|
| Drive the submitted server via raw HTTP from Code Mode, not TrueForge's MCP attachment | **FACT**, confirmed via the real `mcp_servers` schema — attachment requires prior registration by name under Settings → Connectors, no inline arbitrary-URL mode exists | No change — inference promoted to fact |
| Target server runs as a "Daytona background process session" | **FACT**: that specific API is a Daytona-SDK-level construct; not confirmed as something the harness exposes to agent-run exec commands. Sandbox processes/files do persist across exec calls in one session (Phase 1 §6, FACT) | Change: use plain shell backgrounding (`nohup ... &`) across sequential exec calls instead of naming a special primitive |
| One subagent per tool, run in parallel, sharing the sandbox | **FACT, re-surfaced from Phase 1 §11**: "subagents share one sandbox... whether concurrent subagent file writes could collide (undocumented; worth testing rather than assuming safe)" | Change (safety-motivated, see §10): each subagent gets its own copy of the fixture *and* its own short-lived instance of the target server on its own port — true isolation, not just hopeful parallelism |
| Qodo requirement details | **FACT**: install via the Qodo GitHub App (qodo.ai → sign in → Configure → pick org/repos), free for open-source, reviews trigger automatically on PR open, configurable via `.pr_agent.toml`, slash commands (`/review`, `/describe`, `/improve`) available in-PR | New: concrete install/workflow steps for §18 |
| — | **FACT**: Google's Antigravity is now 2.0 (May 2026) — a multi-agent orchestration platform (up to 5 parallel agents), VS Code/JetBrains/Zed extensions, browser control for visual UI verification, generates reviewable "Artifacts" (screenshots, plans) | New: informs §21 — a real, current tool, but see the honest recommendation there about tool-juggling as a beginner |
| — | **FACT**, re-confirmed directly from the cloned repo: `npx @truefoundry/trueforge@latest` (Node 22.14+), opens `localhost:8790`; `npm i @truefoundry/trueforge-sdk` for programmatic use | Grounds §22/§23/§36 in exact, current commands rather than paraphrase |

---

## 4. Product Definition

**Problem:** an MCP server's `readOnlyHint`/`destructiveHint` annotations are the entire trust boundary every approval-gated harness (TrueForge included) is built on, and nothing checks whether they're true.

**Target user (MVP-specific, narrower than Phase 4's full framing):** a developer who has just written or is about to publish an MCP server — for a personal project, a company's internal `MCP_CATALOG_PATH`, or a public listing — and wants to know, before anyone trusts it, whether its tools actually do what they claim.

**Core job-to-be-done:** submit a server + a disposable fixture → get back a per-tool verdict, backed by an observed before/after state diff, not a guess.

**MVP promise, stated so you can say it truthfully on camera:** *"Attest starts your MCP server in an isolated sandbox, actually calls each of its tools against a throwaway test database, and tells you — with the before/after evidence attached — whether its safety annotations match what it actually did."*

**Non-goals for the 4.5-day MVP (explicit, so nothing creeps in):**
- No probing of third-party servers you don't control or that don't ship a fixture (§9 — this is a safety boundary, not a shortcut).
- No support for every MCP transport/auth mode — the demo servers speak plain streamable-HTTP MCP with no auth.
- No persistent multi-tenant hosting, no user accounts, no login.
- No attempt to *fix* a mismatched server — Attest reports, it does not patch.
- No coverage of every annotation type MCP defines (`idempotentHint`, `openWorldHint`) beyond what's needed to make the `readOnlyHint`/`destructiveHint` story land — name this explicitly as a v1 item, not a gap you pretend doesn't exist.

---

## 5. Product Scope

| Tier | Contains |
|---|---|
| **MVP (this week)** | 2–3 purpose-built demo servers (one with a planted mismatch), one TrueForge agent that clones/starts/tests/diffs/certifies, a UI showing the declared-vs-observed moment, one real human approval gate before "certifying," a certification report (UI + JSON) |
| **V1 (right after)** | Accept arbitrary submitted repos (not just the demo set) with a documented fixture contract; support more annotation types; a CI-mode GitHub Action that runs Attest on every PR to a server repo |
| **Future** | A hosted, multi-tenant certification service; a public badge/registry of certified servers; support for stdio-transport servers if TrueForge ever adds that transport; historical drift tracking (did this server's behavior change between versions) |

---

## 6. Architecture

```mermaid
flowchart TB
    subgraph Client
        UI["Attest UI (Next.js)"]
    end

    subgraph AttestApp["Attest Application (Node/TypeScript)"]
        API["Thin API layer"]
        Store[("Small SQLite store:\nsubmissions, certifications, evidence")]
    end

    subgraph TrueForgeServer["TrueForge (npx, local mode)"]
        Agent["Attest Auditor agent\n(saved via agents.create)"]
        Sandbox["Daytona sandbox\n(provisioned on demand)"]
    end

    subgraph InsideSandbox["Inside one sandbox instance"]
        Clone["git clone (public repo, no creds)"]
        TargetServer["Submitted MCP server\n(started via nohup, own port)"]
        Fixture[("Disposable fixture copy\n(SQLite/JSON, one per tested tool)"]
        CodeModeScript["Code Mode script:\nraw HTTP calls to TargetServer,\nbefore/after diff"]
    end

    UI -->|"submit repo + fixture spec"| API
    API -->|"trueforge-sdk: sessions.create + createTurnStream"| Agent
    Agent -->|provisions| Sandbox
    Sandbox --> InsideSandbox
    CodeModeScript -->|"HTTP (not MCP attachment — see §0)"| TargetServer
    CodeModeScript -->|reads/writes| Fixture
    Agent -->|"tool.approval_required event"| API
    API -->|"user.tool_approval"| Agent
    Agent -->|turn events, incl. subagent threads| API
    API --> Store
    Store --> UI
```

**Why this shape, not the naive one from the brief's example:** the naive `User → UI → API → Agent → Sandbox → Submitted Server → Fixture` chain is directionally right but hides the one fact that matters most (§0): the "Submitted MCP Server" box is never a TrueForge *tool* — it's a process the sandbox happens to also be running, reached over plain HTTP by code the agent wrote, not through TrueForge's MCP-client machinery. Get this distinction right early or you'll spend a day trying to "register" a server that TrueForge has no fast path to register.

---

## 7. TrueForge Integration

### The boundary, stated plainly

```text
TRUEFORGE'S RESPONSIBILITY                    ATTEST APPLICATION'S RESPONSIBILITY
────────────────────────────                  ────────────────────────────────────
Agent loop, model calls, streaming            Thin UI + API wrapping the SDK
Sandbox provisioning & isolation               Deciding what a "safe test call" is
Approval gate enforcement                      Fixture design & fixture copying logic
Session persistence & resumability             Rendering the before/after diff nicely
Subagent fan-out (thread management)           Turning raw evidence into a verdict label
GitHub MCP (reading the submitted repo)        Storing submissions/certifications (small SQLite)
```

**If TrueForge were removed:** you would have to hand-build a sandboxed execution environment, an approval-pause/resume protocol that survives generated code, and a subagent isolation model — the entire hard 30% of this product. That "if removed, significantly harder" test (per the brief) is passed cleanly, which is exactly the "Use of sponsor tools" story to tell on camera.

### Real code, from the actual SDK (verified against the cloned repository this pass)

**Saving the Attest Auditor agent, once, via the API — not the chat UI, since this needs to be created programmatically and reused for every submission:**

```typescript
import { TrueForge } from '@truefoundry/trueforge-sdk';

const client = new TrueForge({ baseUrl: process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790' });

await client.agents.create({
  name: 'attest-auditor',
  spec: {
    model: { name: 'anthropic/claude-sonnet-4-6' },
    instructions: `You audit MCP servers. Given a repo URL and a fixture spec, clone the repo,
      install dependencies, start the server, list its tools, and for each tool run exactly one
      safe test call against the fixture you're given — never against a live or production system.
      Report only observed before/after state changes. Do not assert a verdict from the tool's
      name or description alone; the verdict engine (outside your reasoning) does that from your
      evidence.`,
    mcp_servers: [{ name: 'github', enable_tools: ['@read-only'] }],
    config: { sandbox: { enabled: true }, dynamic_sub_agents: { enabled: true } },
  },
});
```

**Running one audit (called from Attest's own backend when a user submits a server):**

```typescript
const { data: session } = await client.sessions.create({ agent: { name: 'attest-auditor' } });

const stream = await client.sessions.createTurnStream(session.id, {
  input: [{
    type: 'user.message',
    content: `Audit the MCP server at ${repoUrl}. Fixture spec: ${fixtureSpecJson}.`,
  }],
});

for await (const { data: event } of stream.withMetadata()) {
  // persist event.type + payload to your small SQLite store as it streams,
  // so the UI can show "cloning… → starting server… → testing tool N of M…" live
}
```

**Handling the approval pause before "publish certification" (the one gated write in this product — see §9):**

```typescript
// identical shape to the approval pattern in TrueForge's own docs (api/use-agent.mdx):
// collect tool.approval_required events, look up the pending tool_call by id,
// show it to a human in the Attest UI, then resume with:
await client.sessions.createTurnStream(session.id, {
  input: [{
    type: 'user.tool_approval',
    threadId: pendingApproval.threadId,
    toolCallId: pendingApproval.toolCallId,
    approval: { status: 'allow' }, // or { status: 'deny', reason: '...' }
  }],
});
```

**Gating the right tool explicitly — do not rely on annotation defaults alone.** Per Phase 3's own finding (carried forward here because it applies to *your own* agent, not just Repro's): TrueForge's default gate fails open on unannotated tools. Attest's "publish certification" action should be a tool your own small internal API exposes to the agent (e.g., a `publish_certification` MCP tool you author with `mcp-builder`, or simply a literal name in `require_approval_for_tools`) — set explicitly:

```json
{ "name": "attest-internal", "require_approval_for_tools": ["publish_certification"] }
```

Do not trust that it happens to be annotated correctly by default.

---

## 8. MCP Verification Engine

**Design, refined from Phase 4's `ToolBehaviorClaim / ObservedBehavior / Evidence / Verdict` sketch:**

```typescript
interface ToolBehaviorClaim {
  toolName: string;
  declaredReadOnly: boolean | undefined;   // from readOnlyHint — undefined is itself meaningful (§3, Phase 3's fail-open finding)
  declaredDestructive: boolean | undefined; // from destructiveHint
  inputSchema: JSONSchema;
}

interface FixtureSnapshot {
  takenAt: string;
  rows: Record<string, unknown[]>; // one entry per table/collection in the fixture
}

interface Evidence {
  toolName: string;
  testInput: Record<string, unknown>;
  before: FixtureSnapshot;
  after: FixtureSnapshot;
  diff: { table: string; change: 'added' | 'removed' | 'modified'; rowSummary: string }[];
  rawResponse: unknown; // the tool's own return value, for the evidence viewer
}

type Verdict =
  | { kind: 'VERIFIED'; toolName: string }                       // declared and observed agree
  | { kind: 'MISMATCH'; toolName: string; severity: 'HIGH' | 'MEDIUM'; evidence: Evidence }
  | { kind: 'UNVERIFIABLE'; toolName: string; reason: string }    // e.g. fixture doesn't cover this tool's path
  | { kind: 'TEST_FAILED'; toolName: string; error: string }      // the call itself errored
  | { kind: 'UNSAFE_TO_TEST'; toolName: string; reason: string }; // no safe, schema-valid input constructible
```

**Deriving the verdict from evidence — deterministically, not by LLM judgment (§46 principle):**

```text
if diff.length === 0 and declaredReadOnly === true  → VERIFIED
if diff.length  > 0 and declaredReadOnly === true    → MISMATCH, severity HIGH
if diff.length === 0 and declaredReadOnly === false  → MISMATCH, severity MEDIUM ("claims write, did nothing observable")
if diff.length  > 0 and declaredReadOnly === false    → VERIFIED
if declaredReadOnly === undefined                     → UNVERIFIABLE, reason: "no annotation declared — cannot compare"
```

This is deliberately a plain function over the `Evidence` object, not a model call — the LLM's job is generating the test input and writing the human-readable explanation of *why* a mismatch matters, never deciding the verdict itself (§15).

---

## 9. Safety Architecture

**Trust boundary, stated once, applied everywhere:** Attest only ever executes code the *submitter* provided (the server) against data the *submitter* provided (the fixture), inside a sandbox neither the submitter nor the tested server can see out of. It never reaches a system Attest's own operator doesn't control. This is the direct fix for the exact risk Phase 4 flagged as the single biggest way this idea could fail.

| Concern | MVP answer |
|---|---|
| Process isolation | The target server runs as a subprocess inside the Daytona sandbox, never on the host running Attest's own app |
| Network isolation | The sandbox's outbound network is used only for `git clone` (public repo) and `npm`/`pip install`; the target server itself is bound to `localhost` inside the sandbox and never exposed externally |
| Filesystem isolation | Everything lives inside one ephemeral sandbox, auto-deleted per TrueForge's documented lifecycle (Phase 1: 5-day auto-delete, sooner if idle) |
| Fixture isolation | Every subagent gets its own **copy** of the fixture file before testing its one tool — no shared mutable state between concurrent tests (§10) |
| Credentials | The demo servers require no auth; the target repo is public, so no token ever enters the sandbox (the exact mitigation Phase 3 recommended for Repro's own demo repo, reused here) |
| Timeouts | Every sandbox exec call inherits TrueForge's 60-second-per-operation ceiling (Phase 1, FACT) — server startup and each individual tool test must each fit inside that, or be chunked across sequential calls |
| Destructive-call prevention | Test inputs are generated to be **schema-valid but minimal and reversible against the fixture** (e.g., append/read operations, not a `DROP TABLE`-shaped input) — this is a real, named limitation: Attest cannot promise it always avoids a genuinely catastrophic call from a maliciously-designed tool, only that it never runs against anything but a throwaway fixture, so "catastrophic" is capped at "the fixture is ruined," never a real system |
| Malicious submitted server / prompt injection via tool output | The agent's own instructions explicitly tell it to treat tool output as untrusted data, not instructions — the same mitigation TrueForge's own approval gate relies on generally (Phase 1 §10); the fixture-copy isolation means a malicious server can, at worst, corrupt its own disposable copy |
| Dependency installation risk | Runs inside the sandbox only, never on the host; capped by the same 60-second-per-operation limit, which is itself a mild safety property (a runaway install can't hang forever) |
| Cleanup | Sandbox auto-stop/archive/delete is TrueForge-native (Phase 1); nothing Attest-specific needs building for teardown |

**What the MVP does NOT protect against — stated honestly, not glossed over:** a target server that behaves differently when it detects it's being tested (a "testing-aware" adversarial server); a server whose dependency-install step itself does something malicious to the sandbox before the server even starts; any server that isn't submitted with a working, safe fixture (these are correctly reported as `UNSAFE_TO_TEST`, not silently skipped).

---

## 10. Agent + Subagent Architecture

**Root agent's job:** clone the repo, install dependencies, start the target server once to discover its tools (`tools/list`) and their declared annotations, then decide the test plan — which tool gets tested, with what fixture copy, on what port — and hand each one to a subagent.

**Per-tool subagent's job (deliberately narrow):** given one tool name, its schema, its declared annotation, and its own private fixture copy + its own short-lived server instance on its own port — construct one schema-valid, minimal test input, call it via raw HTTP from Code Mode, snapshot the fixture before and after, return the `Evidence` object. **Nothing more.** It does not decide the verdict (§8 does that deterministically) and it does not touch any other tool's fixture or server instance.

**Why subagents, specifically, and why this exact isolation design:** Phase 1 documented subagents as running *in parallel, sharing one sandbox* — and separately flagged, honestly, that whether concurrent subagent file writes collide was never tested by that research (§3 above). Rather than assume it's safe, this design sidesteps the question entirely: before fan-out, the root agent (via one Code Mode call) copies the fixture N times and starts N short-lived instances of the target server, each on its own port, each pointed at its own copy. Each subagent then has zero shared mutable state with any other — genuine parallelism, with the concurrency question made moot rather than merely hoped away.

**What's shared vs. isolated:**

| Shared across subagents | Isolated per subagent |
|---|---|
| The cloned repo source and installed dependencies (read-only after install) | The running server instance (its own port) |
| The root agent's overall session/thread | The fixture copy (its own file) |
| — | The `Evidence` object it returns |

**How results are merged:** the root agent waits for all subagent threads (native, synchronous fan-in per Phase 1), collects their `Evidence` objects, runs the deterministic verdict function (§8) over each, and assembles the certification report — a plain aggregation step, not a second round of LLM judgment.

**Avoiding hallucinated verdicts, concretely:** the subagent's *only* output that matters downstream is the `Evidence` object (a before/after fixture diff, which is data, not opinion). The model is never asked "was this tool safe?" as a yes/no it can simply assert — it's asked to produce a test call and let a deterministic function look at what actually happened.

---

## 11. Evidence + Verdict Engine

Types are in §8. The certification report aggregates one `Verdict` per tested tool:

```typescript
interface CertificationReport {
  serverRepo: string;
  commitSha: string;
  testedAt: string;
  verdicts: Verdict[];
  overall: 'CERTIFIED' | 'FLAGGED' | 'INCONCLUSIVE'; // CERTIFIED only if every verdict is VERIFIED or UNVERIFIABLE-with-no-mismatches
  approvedBy: string | null; // set only after the human approval gate (§7) fires
}
```

**Severity/confidence, kept simple for the MVP:** `MISMATCH` on a tool declared `readOnlyHint: true` that actually wrote is always `HIGH` severity (this is the exact case the whole product exists to catch); everything else is `MEDIUM`. Confidence is binary for the MVP — evidence exists or it doesn't (`VERIFIED`/`MISMATCH`) vs. it couldn't be gathered (`UNVERIFIABLE`/`TEST_FAILED`/`UNSAFE_TO_TEST`) — a confidence *score* is a V1 nicety, not an MVP requirement.

---

## 12. Demo MCP Servers

Build these first (§28, §36) — they are the whole proof.

**Server A — `invoice-server` (the WOW case).** Tools: `list_invoices` (declared `readOnlyHint: true`, genuinely read-only), `get_invoice` (declared `readOnlyHint: true`, **but secretly appends a row to an `audit_log` table on every call** — the planted mismatch), `create_invoice` (declared `readOnlyHint: false`, genuinely writes — a clean `VERIFIED` case to show the tool isn't just flagging everything red). Fixture: a small seeded SQLite file with an `invoices` table and an `audit_log` table.

**Server B — `notes-server` (the clean-pass case).** Tools: `search_notes` (true read-only), `create_note` (true write). Both correctly annotated — demonstrates Attest correctly certifies a well-behaved server instead of always crying wolf, which matters for credibility on camera.

**Server C — `legacy-server`, optional if time allows (the honest-limits case).** One tool with **no annotation at all** — demonstrating the `UNVERIFIABLE` path and letting you say, on camera, "this is exactly the case Phase 3's own research found silently slips through a harness's default gate — Attest calls it out instead of assuming it's safe."

All three: deterministic, single-file or few-file Node/Express or Python/FastAPI servers speaking plain streamable-HTTP MCP, no auth, hosted in your own public demo GitHub org — satisfying "yours to touch" (rule §1) cleanly.

---

## 13. Backend

TypeScript throughout (see §16 for why). A thin Next.js API-routes backend is enough — this is not a service that needs to scale, it needs to run one audit at a time, reliably, during a live demo.

**Responsibilities:** accept a submission (repo URL + fixture spec), call the TrueForge SDK (§7), persist streamed events to the small SQLite store as they arrive (so the UI can show live progress without re-querying TrueForge's own event log constantly), expose the pending approval to the UI, forward the human's decision back to TrueForge, and serve the finished `CertificationReport`.

---

## 14. Frontend/UI

Next.js App Router, plain React + Tailwind (no heavier UI kit needed for a hackathon timeline). Screens, in the order a judge should see them:

1. **Dashboard** — past runs, each a card: server name, overall verdict badge, timestamp.
2. **Submit server** — repo URL + fixture spec form.
3. **Live run view** — a vertical timeline of the observability events (§27) as they stream in: "Cloning… → Dependencies installed → 3 tools discovered → Testing get_invoice…"
4. **Tool-by-tool results** — a card per tool, verdict badge (green/red/gray), one line of evidence summary.
5. **Evidence viewer / before-after diff** — **the single most important screen.** Two columns, "Declared" vs. "Observed," with the fixture row that changed highlighted in the "Observed" column. This is the moment from §11 of Phase 4 rendered as UI, and it should be impossible to look at and not immediately understand what happened.
6. **Approval modal** — the pending `publish_certification` call shown plainly, Allow/Deny.
7. **Certification summary** — the final report, shareable/copyable JSON alongside the human-readable version.

**Design direction (ENGINEERING RECOMMENDATION, not researched fresh):** treat this like a security/compliance tool's UI (think a dependency-scanner or a CI check run page), not a chat window — status colors that mean something specific (green=verified, red=mismatch, gray=unverifiable), monospace for evidence/JSON, plenty of whitespace around the before/after diff so it reads instantly.

---

## 15. Repository Structure

```text
attest/
├── apps/
│   └── web/                  # Next.js app: UI + API routes (§13, §14)
├── agent/
│   ├── agent-spec.ts         # the attest-auditor agent definition (§7)
│   └── prompts/              # instruction text, kept out of code for easy iteration
├── sandbox-scripts/
│   ├── discover-tools.ts     # Code Mode script: clone, install, start, list tools
│   └── test-tool.ts          # Code Mode script: one subagent's per-tool test + diff
├── demo-servers/
│   ├── invoice-server/       # Server A (§12)
│   ├── notes-server/         # Server B
│   └── legacy-server/        # Server C (optional)
├── packages/
│   └── verdict-engine/       # the pure, deterministic §8 logic — unit-testable in isolation
├── tests/
├── docs/
│   └── architecture.md       # a trimmed version of this file's §6–§11, for the README
├── .github/workflows/        # Qodo/CI config (§18)
├── README.md
├── LICENSE
└── .env.example
```

**Why this shape:** `verdict-engine` as its own package is the single highest-leverage structural decision — it's pure functions over data (§8), fully unit-testable with zero TrueForge/network dependency, and it's the piece a judge reading your code will check first to confirm the verdict isn't just an LLM's opinion.

---

## 16. Technology Decisions

| Decision | Choice | Why | Risk | Time cost |
|---|---|---|---|---|
| Backend language | TypeScript | `trueforge-sdk` is TS-native; one language end to end for a beginner | Low | None — saves time vs. a second language |
| Frontend | Next.js (App Router) | Best AI-coding-assistant support of any current framework; UI + simple API in one project | Low | Low |
| Database | Single-file SQLite (`node:sqlite` or `better-sqlite3`) | You need *some* persistence for the dashboard/history, but nothing that justifies a server — TrueForge already persists the full agent event log natively | Low | Very low |
| Styling | Tailwind | Fast to iterate with AI assistance, no design-system setup overhead | Low | Low |
| Validation | Zod | Standard, typed, matches the TS-everywhere choice | Low | Low |
| Testing | Vitest | Fast, standard for TS/Next.js, well-supported by AI tools | Low | Low |
| Package manager | npm | Zero extra install; matches TrueForge's own docs exactly (`npx`, `npm i`) — one less thing to debug | Low | None |
| Containerization | None for the app itself | The only thing that needs isolation is the sandbox, which TrueForge/Daytona already provides | None | Saves time |
| Logging | Plain structured `console.log(JSON.stringify({...}))` | Enough to debug a live demo; a real logger is V1, not MVP | Low | None |

---

## 17. Git/GitHub Workflow

Exact, beginner-level, assuming zero prior Git knowledge:

**WHAT:** create the repository. **WHY:** it's the required public artifact (§1). **HOW:**
```bash
# On github.com: New repository → name it "attest" → Public → Add a README → Create
git clone https://github.com/<your-username>/attest.git
cd attest
```
**EXPECTED RESULT:** a local `attest/` folder containing `README.md`. **IF IT FAILS:** "command not found: git" means Git isn't installed — see §23.

**Branching, from day one:**
```bash
git checkout -b feat/bootstrap
# ...make changes...
git add .
git commit -m "bootstrap: Next.js app + repo structure"
git push -u origin feat/bootstrap
```
Then open a PR on github.com from that branch into `main`. **Naming convention:** `feat/<short-name>` for features, `fix/<short-name>` for bug fixes — matches the PR sequence in §18.

**Merge strategy:** "Squash and merge" on GitHub's PR page — keeps `main`'s history to one clean commit per feature, easy for a judge to skim.

**Secrets:** never commit `.env` — `.gitignore` already excludes it in a fresh Next.js project; double-check before your first commit. Put your model API key and any local config in `.env`, and keep `.env.example` (no real values) committed instead.

**License:** MIT, added via GitHub's "Add file → Create new file → LICENSE" template picker — matches TrueForge's own licensing and keeps things simple.

---

## 18. Qodo Strategy

**FACT, verified this pass:** install via the managed GitHub App — sign in at qodo.ai, go to the Qodo GitHub App page, click **Configure**, select your account/org, select the `attest` repository, confirm. Free for open-source. It then reviews automatically on every PR open, no CI file required for the basic flow (a self-hosted GitHub Actions version exists too, but the managed App is faster to set up and is what you want with 4.5 days left).

**Do this on day one, before your first real feature PR** — not at the end.

**Realistic PR sequence for 4.5 days** (revised from the brief's example to match §26's phases):

```text
PR #1 — repo bootstrap (Next.js app, folder structure, README skeleton)
PR #2 — TrueForge agent spec + SDK wiring (agents.create, a smoke-test script)
PR #3 — demo-servers/invoice-server (Server A, including the planted mismatch)
PR #4 — sandbox-scripts: discover-tools + test-tool Code Mode scripts
PR #5 — verdict-engine package (pure, unit-tested)
PR #6 — subagent orchestration + approval flow wiring
PR #7 — UI: submit → live run → evidence viewer
PR #8 — demo-servers B and C + polish + README completion
```

Each PR: Qodo reviews automatically within minutes → read its findings → fix real ones, note-and-dismiss false ones with a one-line reply (this itself is good evidence for a judge that you engaged with review, not just installed a badge) → push the fix → Qodo re-reviews → merge only once it's clean or you've explicitly addressed every comment. **Do not** batch everything into one PR at the end — the rules explicitly say a single last-minute PR does not satisfy the Code Quality track.

---

## 19. Claude Code Strategy

**Best for:** repository-wide reasoning, the TrueForge SDK integration (§7), the sandbox scripts (§8–§10), the verdict engine (§8) — anything where correctness matters more than visual iteration speed, and anything spanning multiple files at once (e.g., "wire the approval flow from the SDK through the API route to the UI modal").

Use it as your primary driver for PRs #2, #4, #5, #6 above.

---

## 20. Cursor Strategy

**Best for:** the UI (§14) specifically — fast, visual, single-file-at-a-time iteration on React components where you want to see a change and immediately adjust it, and general small targeted edits once the architecture is already in place.

Use it as your primary driver for PR #7 and UI polish inside PR #8.

---

## 21. Antigravity Strategy

**FACT, current as of this pass:** Antigravity 2.0 (relaunched May 2026) is a real, capable, multi-agent orchestration platform with genuinely useful browser-control for visually verifying UI work, and it generates reviewable "Artifacts" (screenshots, plans) as it goes.

**ENGINEERING RECOMMENDATION, stated honestly:** you are a beginner with 4.5 days. Splitting attention across Claude Code, Cursor, *and* Antigravity is a realistic way to lose a day to tool-switching overhead, not gain one. **Use it only for one narrow, optional job if you have spare time on Friday/Saturday: visually verifying the evidence-viewer UI (§14) actually renders the before/after diff correctly**, using its browser-control artifact generation as a second pair of eyes. If Thursday/Friday are tight, skip it entirely — Claude Code + Cursor alone are sufficient to ship the whole plan.

---

## 22. Testing

| Layer | What's tested | Priority |
|---|---|---|
| Unit | `verdict-engine` (§8) — every branch of the deterministic verdict function; fixture-diff logic | **Highest** — this is the core claim of the product |
| Integration | target server startup + `tools/list` discovery; one real tool call + snapshot round-trip | High |
| Agent | correct subagent dispatch (one per declared tool); no verdict is asserted without a corresponding `Evidence` object present | High |
| End-to-end | full flow against `invoice-server`, asserting the `get_invoice` mismatch is caught | High — this is your demo, tested as code before it's tested live |
| Failure tests | server fails to start; tool call times out; no annotation present; dependency install fails | Medium — protects the demo from an embarrassing live crash |

**Priority given 4.5 days:** unit tests on the verdict engine and the end-to-end `invoice-server` case are non-negotiable; everything else is valuable but cuttable under time pressure (§35).

---

## 23. Local Environment From Zero

**WHAT:** confirm every prerequisite before touching TrueForge. **WHY:** debugging a missing dependency mid-build costs far more time than checking it now. **HOW / EXPECTED RESULT / IF IT FAILS:**

| Tool | Check with | Expect | If missing |
|---|---|---|---|
| Node.js 22.14+ | `node -v` | `v22.14.0` or higher | Install from nodejs.org |
| npm | `npm -v` | any recent version | Bundled with Node |
| Git | `git --version` | any recent version | Install from git-scm.com |
| GitHub CLI (optional) | `gh --version` | any version | `brew install gh` or github.com/cli/cli |
| VS Code or Cursor | open the app | it opens | download from respective sites |
| A model API key | — | an Anthropic (or other) API key ready to paste | console.anthropic.com |
| Daytona API key | — | a key with sandbox/snapshot write permission | daytona.io — needed the moment you enable the sandbox (Phase 1, quickstart, FACT) |

**Step 1 — Install dependencies:** `npm install` inside `apps/web` once the repo exists (§17).
**Step 2 — Start TrueForge:** `npx @truefoundry/trueforge@latest` **[FACT, verified against the live repo this pass]** → open `http://localhost:8790`.
**Step 3 — Connect a model:** Settings → Models → pick Anthropic → paste key → Create.
**Step 4 — Run first agent:** in the chat UI, just talk to the default model — confirms the server works before you add anything else.
**Step 5 — Connect MCP:** Settings → Connectors → add GitHub by URL/catalog (needed for the agent to read submitted repos).
**Step 6 — Run first sandbox execution:** Settings → Sandbox providers → Daytona → paste API key → Save; then ask the chat agent to "run `echo hello` in a sandbox" to confirm end-to-end sandbox provisioning works before building anything on top of it.
**Step 7 — Create your repository:** §17.
**Step 8 — Run first Attest workflow:** the vertical slice, §28.

---

## 24. AI Coding Workflow

```text
Understand the ONE thing you're building this session
↓
State it as a bounded prompt to Claude Code / Cursor (one file or one clear feature, not "build Attest")
↓
Run it locally
↓
Read the actual output/error — don't assume success
↓
Run the relevant test (§22)
↓
Commit, push, open/update PR
↓
Let Qodo review (§18)
↓
Fix real findings
↓
Merge
↓
Next bounded task
```

**Discipline rule:** if a single AI prompt would touch more than ~3 files or more than one phase from §26, split it. This is the single biggest guard against "AI generated a giant unmaintainable codebase" (§25's stated fear) — bounded prompts, reviewed before moving on.

---

## 25. Implementation Phases

| Phase | Objective | Key output | Est. time |
|---|---|---|---|
| 0 — Environment | Everything in §23 confirmed working | A sandbox that can run `echo hello` | 1–2 hrs |
| 1 — GitHub + Qodo | Repo live, Qodo installed | PR #1 merged | 1 hr |
| 2 — TrueForge smoke test | `attest-auditor` agent saved and callable via SDK | A script that opens a session and prints one reply | 1–2 hrs |
| 3 — Demo servers | Server A (with planted mismatch) built and runnable standalone | `invoice-server` passes a manual `curl` test outside TrueForge entirely | 3–4 hrs |
| 4 — Sandbox runner | Agent can clone, install, start Server A inside the sandbox | A sandbox exec log showing the server responding to `tools/list` | 3–4 hrs |
| 5 — Behavior observation | One tool called, fixture diffed | A real `Evidence` object for `get_invoice` showing the audit-log write | 3–4 hrs |
| 6 — Verdict engine | §8's pure function, unit-tested | `MISMATCH, HIGH` correctly produced from real evidence | 2 hrs |
| 7 — Subagent orchestration | One subagent per tool, isolated fixtures/ports (§10) | 3 tools tested, 3 verdicts, no cross-contamination | 4–5 hrs |
| 8 — Approval flow | `publish_certification` gated, resumable | Approval pause visible in a raw SDK event log | 2–3 hrs |
| 9 — UI: submit + live run | Screens 1–3 (§14) | You can submit a repo from the browser and watch it stream | 4–5 hrs |
| 10 — UI: evidence + approval | Screens 5–6 | The before/after diff renders correctly for the planted mismatch | 4–5 hrs |
| 11 — Servers B & C | Clean-pass and no-annotation cases | Both produce correct, distinct verdicts | 2–3 hrs |
| 12 — Testing pass | §22's priority tests | Green CI locally | 3 hrs |
| 13 — Polish | UI details, error states | Nothing looks broken during a run-through | 2–3 hrs |
| 14 — Demo | Record, per §28 | A clean take | 2–3 hrs |
| 15 — Submission | README, write-up, final PR, checklist (§30) | Submitted | 2 hrs |

---

## 26. 4.5-Day Execution Schedule

| Day | Focus | Phases |
|---|---|---|
| **Wed (today)** | Environment, GitHub+Qodo, TrueForge smoke test, Server A built and manually verified | 0, 1, 2, 3 |
| **Thu** | The whole verification engine, end to end, for one tool, without a UI yet — this is the hardest, most technically important day | 4, 5, 6 |
| **Fri** | Subagent fan-out for all tools + approval gate + the UI's core screens | 7, 8, 9, 10 |
| **Sat** | Servers B & C, integration/testing, polish, first full demo rehearsal | 11, 12, 13 |
| **Sun** | Only: bug fixes found in rehearsal, final documentation, record the real demo, final Qodo-clean PR, submit | 14, 15 |

**Realism check, as instructed:** this assumes real but not superhuman days (roughly 6–8 focused hours, not 12), and it front-loads the *hardest, least-glamorous* work (Thu) before any UI exists — deliberately, because a beautiful UI over a verification engine that doesn't actually work yet is a worse Thursday-night position than an ugly terminal log that proves the mismatch gets caught. If Thursday's phases 4–6 aren't done by Thursday night, **cut UI scope on Friday, not verification-engine scope** — the UI can be simpler; the core claim cannot be faked.

---

## 27. Vertical Slice (Build This Before Anything Beautiful)

The smallest end-to-end proof, targeted for end of Thursday:

```text
A script (not a UI) that: opens a session on attest-auditor
→ tells it to clone invoice-server, start it, call get_invoice once against a fresh fixture copy
→ prints the raw Evidence object to the terminal
→ shows audit_log going from 3 rows to 4 rows
```

If this works from the command line, everything in Phase 25 §7–§15 is "wire it to a UI and add more tools" — genuinely lower-risk work. If it doesn't work, nothing downstream matters yet — do not start the UI until this terminal-only slice is real.

---

## 28. Observability

```text
RUN_STARTED → SERVER_CLONED → DEPENDENCIES_INSTALLED → SERVER_STARTED →
TOOLS_DISCOVERED → TOOL_TEST_STARTED(tool) → STATE_SNAPSHOT_BEFORE(tool) →
TOOL_CALLED(tool) → STATE_SNAPSHOT_AFTER(tool) → EVIDENCE_CREATED(tool) →
VERDICT_CREATED(tool) → ALL_TOOLS_TESTED → APPROVAL_REQUESTED →
APPROVAL_GRANTED|DENIED → CERTIFICATION_PUBLISHED
```

Persisted to the small SQLite store (§16) as they stream from TrueForge's own turn-event stream (§7) — the UI's live-run screen (§14, screen 3) is a direct rendering of this list, not a separate polling mechanism.

---

## 29. Security

Restated compactly from §9 — the MVP protects against: a submitted server's mistakes or lies affecting anything beyond its own disposable fixture copy; credentials ever entering the sandbox (none needed, given public demo repos); a runaway process exceeding its resource/time budget (TrueForge's native timeouts). It does **not** protect against: a deliberately test-detecting adversarial server, or a malicious dependency-install step — both named honestly rather than glossed over, because an unsupported security claim is worse than an honest gap on a "Control and safety" judged criterion.

---

## 30. Performance

**Estimate (HYPOTHESIS, will need real measurement on Thursday):** server startup ~5–15s per instance; per-tool test call ~1–5s; with 3 tools tested in parallel (isolated ports/fixtures, §10) rather than serially, total verification time for a 3-tool server should land around 20–40 seconds — well inside a demo's patience, and safely inside the 60-second per-exec-call ceiling *per operation*, since each subagent's work is its own set of short calls, not one long one.

**What to parallelize:** the per-tool test calls (§10) — genuinely, via isolated subagents. **What NOT to parallelize:** the initial clone/install/discover step — it happens once, serially, before fan-out, because every subagent depends on it having finished.

---

## 31. Cost

**Principle (per §46): LLM for reasoning, deterministic code for evidence.** Concretely: the model is used to (a) plan which tools to test and construct one test input per tool, and (b) write the human-readable explanation of a mismatch. It is never used to decide VERIFIED-vs-MISMATCH (§8 is a plain function) and never re-reads a raw fixture dump (Code Mode summarizes before returning, per Phase 1's own large-result-offloading mechanism). Subagents multiply cost roughly linearly with tool count — fine at demo scale (a handful of tools across 2–3 servers), a real V1 cost lever later.

---

## 32. Judging Optimization Matrix

| Criterion | What judges want | Attest feature | Evidence in demo | Evidence in repo |
|---|---|---|---|---|
| Potential impact | A real, findable job someone would hand over | Every MCP-server publisher needs this before anyone trusts their server | Framing in the first 20 seconds (§33) | README problem statement |
| Creativity/originality | Combining capabilities the six official examples don't show | Dynamic, execution-verified certification — not another chat/dashboard idea | The mismatch caught live | `docs/architecture.md` naming the static-vs-dynamic gap |
| Technical excellence | More than one context-engineering mechanism, visibly | Sandbox + Code Mode + isolated subagent fan-out + approval, all load-bearing | The live-run timeline (§14 screen 3) | `verdict-engine` package, fully unit-tested |
| Use of sponsor tools | Depth over breadth | One MCP server (GitHub) used correctly, sandbox and subagents used deeply | Narrate explicitly where TrueForge is doing the work | agent-spec.ts, sandbox-scripts/ |
| Control and safety | The irreversible step is unambiguous and gated | `publish_certification` explicitly gated, not left to annotation defaults | Approval modal, clicked on camera | The explicit `require_approval_for_tools` config (§7) |
| Presentation | A demo that narrates where the harness does the work | The declared-vs-observed moment needs zero domain explanation | §33 storyboard | README's architecture section |

**Must-have:** the mismatch-catch end-to-end, the approval gate, a clean README. **High-value:** Server B's clean pass (shows it's not just crying wolf), the live-run timeline. **Nice-to-have:** Server C, a polished dashboard/history screen. **Cut immediately if behind schedule:** history/dashboard screen, Server C, any styling beyond "clean and readable."

---

## 33. Risks + Fallbacks

| Risk | Probability | Impact | Mitigation | Fallback |
|---|---|---|---|---|
| TrueForge local setup friction (Node version, sandbox key) | Medium | High if it eats Wednesday | §23 checklist run *first*, before any code | Use hosted mode (Docker Compose) if `npx` misbehaves — same agent features (Phase 1, FACT) |
| Sandbox can't reach npm/pip registries | Low-Medium | High | Test this explicitly in Phase 0, not assumed | Vendor the demo servers' few dependencies, or use stdlib-only servers |
| Subagent fixture/port isolation bug (the exact concurrency risk named in §10) | Medium | High — would silently corrupt evidence | Isolated-copy design from the start, not bolted on later; test with 2 concurrent tools before trusting 3+ | Fall back to serial (non-parallel) tool testing — slower demo, still correct, still real |
| 60-second exec timeout hit during install | Medium | Medium | Keep demo servers dependency-light by design (§12) | Chunk install across two sequential exec calls if needed |
| Approval config left on defaults (Phase 3's fail-open gap) | Low, if §7 is followed | High if missed | Explicit `require_approval_for_tools` from day one | A pre-demo checklist item: attempt to call `publish_certification` without approval and confirm it pauses |
| UI runs behind schedule | Medium | Medium | Vertical slice (§27) proves the core before UI work starts at all | Demo from the terminal/raw event log if truly out of time — still shows real execution, just less polished |
| Live demo network hiccup | Low | Medium | Rehearse Saturday, record with a backup take | A pre-recorded fallback clip of a known-good run |

---

## 34. Safe MVP vs. Winning MVP

**SAFE MVP:** Server A only, one tool tested (`get_invoice`), the mismatch caught, shown in a terminal or minimal UI, approval gate demonstrated, README complete. This alone clears the qualifying gate and scores on all six criteria — just modestly.

**WINNING MVP:** Safe MVP + Server B (the clean-pass credibility case) + the full evidence-viewer UI (§14 screen 5) + subagent parallel fan-out actually visible in the demo + Server C's `UNVERIFIABLE` case tying explicitly back to Phase 3's own finding. This is the version §26's schedule targets. **Do not add a fourth server, a login system, or a hosted deployment** — none of that raises the score, and every hour spent on it is an hour not spent rehearsing the demo.

---

## 35. "DO THIS NOW" — First 90 Minutes

1. **Run through §23's prerequisite table** — confirm Node, Git, a model API key, a Daytona API key. *(15 min)*
2. **Create the GitHub repo** (`attest`, public) and clone it locally (§17). *(5 min)*
3. **`npx @truefoundry/trueforge@latest`**, open `localhost:8790`, add your model provider in Settings → Models. *(10 min)*
4. **Install Qodo now** via the GitHub App on the new `attest` repo (§18) — before there's even code to review, so it's live for PR #1. *(5 min)*
5. **`git checkout -b feat/bootstrap`**, scaffold a bare Next.js app inside `apps/web` (`npx create-next-app@latest`), commit, push. *(20 min)*
6. **Open PR #1**, let Qodo review it, merge. *(10 min)*
7. **In the TrueForge chat UI**, manually enable the sandbox (Settings → Sandbox providers → Daytona) and ask it to run `echo hello` in a sandbox — confirm the whole chain works before writing a line of Attest-specific code. *(15 min)*
8. **Write a 10-line script using `@truefoundry/trueforge-sdk`** that opens a session against the *default* model (not even `attest-auditor` yet) and prints one streamed reply — confirms the SDK path end to end. *(10 min)*

By the end of this, you have: a public repo, Qodo installed, TrueForge running locally with a model and a working sandbox, and proof the SDK can drive it programmatically. Everything in §25 Phase 2 onward builds on this.

---

## 36. Final Definition of Done

- [ ] Public repo, clean README (architecture, setup, security boundary, AI-disclosure, limitations, license)
- [ ] `invoice-server`'s `get_invoice` mismatch caught end-to-end, reproducibly, from a clean sandbox
- [ ] `notes-server` correctly certified clean (not everything flagged red)
- [ ] Approval gate explicitly configured (not left on annotation defaults) and visibly demonstrated
- [ ] Subagent fan-out visible for at least one multi-tool server
- [ ] Verdict engine unit-tested
- [ ] 8-PR Qodo-reviewed history, no single last-minute mega-PR
- [ ] ~3-minute demo recorded, showing declared-vs-observed as the centerpiece
- [ ] AI-assistant usage disclosed in the write-up, and you can explain every architectural decision in this document without reading from it
- [ ] Submitted before the Sunday deadline, with time held back for upload/link issues

---

*End of Master Build Plan. Next message should be: "Start Phase 0." From there, one bounded phase at a time — per §24's discipline, not the whole implementation at once.*
