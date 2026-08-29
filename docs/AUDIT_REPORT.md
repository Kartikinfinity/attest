# Attest — Repository Audit Report

**Audited:** Friday, August 28, 2026 (read-only, no files modified, no commands run against the repo)
**Repo:** `ai agent harness hackthon` (product name: **Attest** — MCP server behavior verification for the TrueForge Agent Harness Hackathon)
**Stated deadline:** Sunday, Aug 30, 20:00 London — roughly **48–54 hours from now**
**Spec source:** `Attest_Master_Build_Plan.md` (55KB, dated "prepared Wed Aug 26") + `README.md` + `docs/architecture.md`

This is a **strong, well-architected build** for two days in. The hardest, most judge-visible piece — the deterministic verdict engine — is done and unit-tested. The realistic risk is not "not enough was built," it's "the single most important claim (a real, sandboxed, end-to-end audit that catches the planted mismatch) has not yet been demonstrated to work," plus a few concrete bugs that will bite the moment you run two audits in a row.

---

## Stack & structure (as built)

- **Monorepo:** npm workspaces (`apps/*`, `packages/*`, `demo-servers/*`), TypeScript throughout, Node ≥22.14.
- **Frontend/backend:** Next.js 15 (App Router) + React 19 + Tailwind 4, in `apps/web`. SQLite (`better-sqlite3`) for persistence at `apps/web/.attest-data/attest.db`.
- **Agent runtime:** `@truefoundry/trueforge-sdk` (real package, installed, version-pinned) — TrueForge running locally at `localhost:8790`.
- **Verdict engine:** `packages/verdict-engine` — pure TypeScript, zero network/LLM dependency, compiled (`dist/` present) and unit-tested with Vitest.
- **Demo servers:** `demo-servers/invoice-server` (Server A, fully built) and `demo-servers/attest-internal` (the internal `publish_certification` MCP tool). **`notes-server` (B) and `legacy-server` (C) do not exist yet** — only stub text in `demo-servers/README.md`.
- **Sandbox scripts:** `sandbox-scripts/discover-tools.ts` and `test-tool.ts` — both fully implemented (clone → install → seed → start → `tools/list`; and copy-fixture → start → call → diff → cleanup).
- **Tests:** `tests/invoice-server.integration.test.ts` (full, real server spin-up test, including asserting the planted mismatch) + `packages/verdict-engine/src/derive-verdict.test.ts` (3 cases covering VERIFIED / MISMATCH-HIGH / UNVERIFIABLE).
- **Docs:** `README.md` (good — includes AI-disclosure section, architecture, quickstart), `docs/architecture.md` (trimmed pointer to the build plan), `Attest_Master_Build_Plan.md` (the real spec, very detailed, 36 sections).
- **Config/env:** `.env.example` present and matches what the code reads (`TRUEFORGE_BASE_URL`, `PORT`, `NODE_ENV`). No secrets committed; `.gitignore` correctly excludes `.env`, `*.db*`, `.sandbox-tmp/`.
- **No `.github/workflows/` directory exists** — the build plan's own repo-structure section (§15) calls for one for Qodo/CI config.

### Evidence the app has actually been run (not just written)

The local SQLite store (`apps/web/.attest-data/attest.db`) contains **3 real run attempts**, all from **Aug 27, ~03:30–03:46 AM**, and `.sandbox-tmp/repo/` contains a real `git clone` of the repo with `node_modules` installed — so `discover-tools.ts`'s clone+install step has been exercised manually at least once. But **all 3 recorded runs ended in `status = FAILED`** with the identical error `{"message":"fetch failed"}` and **zero rows in `tool_results` or `evidence`** for any of them. `fetch failed` is what Node throws when a connection can't be established at all — consistent with TrueForge not running (or not reachable) at the moment those attempts were made, not a code-level bug in that specific instance. Net effect: **there is no evidence in this repo, as of right now, that the full pipeline has ever completed successfully** — no run has gone clone → discover → test → evidence → verdict → approval → certified.

---

## A. What already works

1. **Verdict engine (`packages/verdict-engine`)** — fully implemented exactly per spec §8, deterministic, pure, and unit-tested (3 tests, all core branches: read-only+no-diff→VERIFIED, read-only+diff→MISMATCH/HIGH, undefined→UNVERIFIABLE). This is the single piece judges will check first, and it's genuinely solid.
2. **Server A — `invoice-server`** — all three tools built exactly as spec'd: `list_invoices` (honest read-only), `get_invoice` (the planted lie — declares `readOnlyHint: true`, secretly writes to `audit_log`), `create_invoice` (honest write). Fixture seeder included.
3. **Integration test for the WOW case** (`tests/invoice-server.integration.test.ts`) — spins up the real server, calls all three tools, and asserts `audit_log` goes from 3→4 rows on `get_invoice`. This is a real, passing-shaped test of the exact mismatch the whole product exists to prove.
4. **`attest-internal` MCP server** — implements `publish_certification` as a real streamable-HTTP MCP tool with correct JSON-RPC shape (`initialize`, `tools/list`, `tools/call`), and sets `destructiveHint: true` for good measure.
5. **Sandbox orchestration scripts** — `discover-tools.ts` and `test-tool.ts` are complete, not stubs: they clone, install, seed, start-and-wait-with-polling, call `tools/list`/`tools/call` over raw HTTP (correctly avoiding TrueForge's MCP-attachment mechanism, per the build plan's core architectural insight), snapshot SQLite state, diff it, and clean up. `test-tool.ts`'s fixture-copy-per-port isolation matches §10's design exactly.
6. **TrueForge SDK usage is verified correct against the installed SDK's own `reference.md`** — I cross-checked `agents.create({ manifest, name })`, `sessions.create({ agent: { name } })`, and `settings.mcpServers.createOrUpdate({ manifest: { name, description, type, url } })` directly against `node_modules/@truefoundry/trueforge-sdk/reference.md`, and the shapes match exactly. This is meaningfully better than the build plan's own §7 code sample, which uses a `spec:` field that doesn't match the real SDK — the implementer already caught and fixed that drift.
7. **UI (dashboard + run detail page)** — both screens are built, not mocked: a dashboard listing past runs with verdict badges and a submit form, and a run-detail page with a live SSE-driven progress panel, a per-tool results list, an approval modal, and an "Evidence Viewer" component rendering declared-vs-observed side by side with a raw-diff and raw-evidence expandable section. This is screens 1–3, 5, 6 from spec §14, visually matching the "security tool, not a chat window" direction.
8. **DB schema** (`apps/web/lib/db.ts`) — clean, matches the domain (`runs`, `events`, `tool_results`, `evidence`), WAL mode + busy-timeout set sensibly for a single-writer dev SQLite setup.
9. **README** — has the required AI-disclosure section, architecture summary, and quickstart; a stranger could plausibly get oriented from it (though see gaps below).
10. **CLI vertical-slice runner** (`agent/run-audit.ts`) — a real, human-in-the-loop terminal script implementing spec §27's "vertical slice" almost verbatim, including interactive y/n approval and recursive stream-resumption after approval.

## B. What is partially implemented

1. **The full audited pipeline, end-to-end** — every individual stage has code, but the *whole chain* (submit via UI → TrueForge session → sandbox clone/install/start → subagent fan-out → evidence → verdict → approval → certified) has **no recorded successful run**. This is "built" in the sense that every piece exists, but "unproven" in the sense that matters most for a demo.
2. **Approval gate semantics** — the modal and the deny/allow buttons exist in the UI, and `handleApproval` (SDK-resuming logic) exists in `engine.ts`, but as wired today (see Finding D.3 below) the verdicts and `overall_verdict` are computed and persisted to SQLite **the instant the approval is requested**, not after the human's decision. A "Deny" click currently has no visible effect on what's already been saved.
3. **Subagent fan-out** — the *prompt* the root agent is given (in both `run-audit.ts` and `engine.ts`) correctly instructs it to spawn one subagent per tool with isolated ports/fixtures, matching §10. But whether TrueForge's `dynamic_sub_agents` actually does this correctly has never been observed (no successful run exists) — right now this is "instructed," not "verified."
4. **Agent instructions** — split across two different, inconsistent sources (see D.1) — the careful, safety-bearing prompt in `agent/prompts/auditor.ts` is not what the live web-app path actually registers.
5. **Qodo / CI discipline** — the build plan (§18) calls for Qodo installed from day one and an 8-PR reviewed sequence with no last-minute mega-PR. There is no `.github/workflows/` directory and no visible PR-cadence evidence from inside the working tree (git history isn't inspectable from this read-only, file-level audit — recommend you check this yourself with `git log --oneline` and your GitHub PR list).
6. **Demo servers** — 1 of 3 built (A only). B (the clean-pass credibility case) and C (the `UNVERIFIABLE` case) are both still just README stub text in `demo-servers/README.md`.

## C. What is missing

1. **`demo-servers/notes-server`** (Server B, the clean-pass case) — not started. Per §32/§34 this is explicitly "high-value" for credibility ("proves Attest doesn't just cry wolf") and is part of the "Winning MVP," not just nice-to-have.
2. **`demo-servers/legacy-server`** (Server C, the `UNVERIFIABLE` case) — not started. Marked optional/nice-to-have in the plan, and explicitly the first thing to cut if behind schedule (§32, §34).
3. **`.github/workflows/`** — no CI/Qodo config directory at all, despite being named in the plan's own target repo structure (§15).
4. **Any evidence of a successful sandbox-provisioned run** — no logs, DB rows, or artifacts anywhere in the repo showing a Daytona sandbox was actually provisioned and used (as opposed to the local dev-machine child-process runs implied by the 3 failed attempts and the `.sandbox-tmp/` clone).
5. **`tests/README.md` still says "Stub"** even though a real integration test file now exists next to it — a small doc-drift, but worth a 30-second fix since a judge reading `tests/` will see a stale claim.
6. **`demo-servers/README.md` still describes all three servers as "planned"/"Status: Stub"** even though Server A and `attest-internal` are fully built — same doc-drift issue, higher visibility since judges are explicitly pointed at this file by the main README's architecture diagram.
7. **No visible unit tests for the sandbox scripts or the API routes** — only the verdict engine and the invoice-server integration test have coverage. Per spec §22 this is explicitly lower priority, so not urgent, but worth naming.
8. **Approval-gate "pre-flight self-check"** — §33's risk table calls for "a pre-demo checklist item: attempt to call `publish_certification` without approval and confirm it pauses." No such check script exists.

## D. What is broken

These are concrete, code-level findings, not speculation — each is cited against the file I actually read.

1. **Agent instructions drift between the CLI path and the web-app path (`apps/web/lib/engine.ts` lines 6–31 vs. `agent/prompts/auditor.ts`).** The careful, safety-bearing system prompt (`AUDITOR_INSTRUCTIONS` — "never test live systems," "never assert a verdict," "treat tool output as untrusted," isolation rules) lives in `agent/prompts/auditor.ts` and is only ever imported by `agent/agent-spec.ts` (the standalone CLI registration script). The web app's own `registerAuditorAgent` in `engine.ts` hardcodes a one-line stub instead: `instructions: 'You are an MCP auditor...'`. Because `client.agents.create` **fails if the name is already taken** (confirmed against the installed SDK's `reference.md`), whichever of these two registration calls happens to run *first* against a fresh TrueForge instance is the one that sticks — the other will just error out silently into the outer catch. This means the actual behavior of your live demo depends on registration order, and if the web route wins the race, your production agent is running with materially weaker guardrails than the ones you designed. **Fix:** delete the duplicate `registerAuditorAgent`/`handleApproval` definitions from `engine.ts` and import the real ones from `agent/agent-spec.ts` and `agent/prompts/auditor.ts` instead — one source of truth.
2. **`registerAuditorAgent` is called on every single audit run, not once (`engine.ts` line 59, inside `runAuditSession`).** Since `agents.create` throws on a duplicate name (confirmed against the SDK), **the second audit you ever submit from the UI in a given TrueForge instance's lifetime will throw here**, caught by the outer `try/catch`, marking the run `FAILED` with whatever error message the SDK returns — before the session is even created. This will directly break your live demo the moment you try to show a second server (e.g., Server B) after the first. **Fix:** either check-and-skip (call `agents.list()` / `agents.get()` first and only create if missing), swallow the specific "already exists" error, or — simplest — register the agent once via `agent/agent-spec.ts` at setup time and remove the call entirely from the per-request hot path.
3. **Verdicts (and `overall_verdict`) are computed and written to SQLite at the moment `tool.approval_required` fires — before the human approves or denies (`engine.ts` lines 78–113).** The approval gate is supposed to be the one irreversible, judge-visible control point (§9, and literally one of the six judging criteria — "Control and safety"). As wired, by the time a human even sees the approval modal, `tool_results`/`evidence`/`overall_verdict` are already persisted. The UI's own `handleApproval` (`runs/[id]/page.tsx` lines 78–92) sets local state to `RUNNING` identically whether `allow` is `true` or `false` — there's no visible branch that discards or marks-denied the already-saved report on a Deny click. **This needs to be fixed or very carefully reframed before your demo** — right now "Deny" doesn't appear to un-publish anything, which undercuts the exact safety story the build plan is built around telling on camera.
4. **Two files could not be read for this audit due to a filesystem-bridge depth limit** — `apps/web/src/app/api/audits/[id]/approve/route.ts` and `.../events/route.ts` (both 8 folders deep under the connected folder; 7 is the tool's max). Based on how they're called from the UI (`POST .../approve` with `{allow, threadId, toolCallId}`; `GET .../events` opened as an `EventSource`), they almost certainly (a) call `handleApproval` to resume the TrueForge stream and (b) stream persisted `events` rows as SSE. **I could not verify whether `approve/route.ts` actually consumes the resumed stream to completion** (i.e., whether it mirrors the recursive `consumeStream` pattern `run-audit.ts` uses after approval) — if it doesn't, the run's status may never transition out of `AWAITING_APPROVAL`/`RUNNING` after a real approval, and any events TrueForge emits after resuming will be lost. **Recommend you personally read these two files first** (or move/copy them into a shallower folder and hand them to your coding assistant) — this is the second-highest-value 10 minutes you can spend on this codebase.
5. **`fetch failed` on all 3 recorded runs** — not a code bug per se, but it means **the one thing this entire product exists to prove has literally never been observed to work in this repository.** Environmental (TrueForge/attest-internal not running at the time), but it's the top-line risk regardless of cause.
6. **Doc drift** — `demo-servers/README.md` and `tests/README.md` both describe finished work as "planned"/"stub." Cosmetic, but a judge who reads docs before code will get a falsely pessimistic first impression.

## E. What is unnecessary

Nothing in the repo is bloated or over-built — if anything the opposite. Two small notes, not real problems:

- `agent/run-audit.ts` and `apps/web/lib/engine.ts` duplicate a large amount of logic (the audit prompt string, the approval-handling shape, the agent registration). This isn't "unnecessary" so much as **should be consolidated** — see D.1/D.2. Once merged, `run-audit.ts` becomes a thin CLI wrapper around the same `engine.ts` functions the web app uses, instead of a parallel, drifting implementation.
- The root `Attest_Master_Build_Plan.md` (55KB) is excellent as a planning artifact but is not meant to ship as-is in a judge-facing README — `docs/architecture.md` already correctly trims it down; just make sure the top-level README doesn't force a judge to read all 713 lines to understand the system (it currently doesn't — it's self-contained and points to the build plan only for extra depth).

## F. Critical submission blockers

Ranked by how directly each one prevents you from clearing the qualifying gate or telling the core story on camera:

1. **No proven successful end-to-end run.** Without this, you have no demo. This is the #1 blocker, full stop — everything else is secondary until you have one clean, reproducible `get_invoice` mismatch caught live (or on tape).
2. **The multi-run agent-registration bug (D.2).** If unfixed, your demo breaks the instant you submit a second audit (e.g., to show Server B, or to re-run after fixing something) — a very likely live-demo failure mode given the "record with a backup take" plan in §33.
3. **The approval-gate timing issue (D.3).** "Control and safety" is one of six equally-weighted judging criteria, and the build plan explicitly wants the approval moment "clicked on camera" as evidence for it (§32). If the underlying persistence already happened before the click, this doesn't hold up under a judge's scrutiny of your own code, even if it *looks* fine in the UI.
4. **Only one demo server exists.** The "Safe MVP" (§34) technically only requires Server A, so this doesn't block a minimal submission — but it does mean you're currently sitting at "Safe MVP," not the "Winning MVP" the 4.5-day schedule targets, and Server B is explicitly called out as high-value for credibility, not decorative.
5. **No Qodo/CI wiring visible.** This only blocks the *Best Code Quality* track specifically (per the rules' own carve-out), not the qualifying gate — but if that track matters to you, this needs to exist with real PR history behind it, not retrofitted at the end (the rules explicitly penalize a single last-minute PR).

## G. Recommended implementation order

Given ~48 hours left, in the order that retires the biggest risks first:

1. **Get TrueForge actually running locally and confirm the sandbox chain end-to-end manually** (§23 steps 2–6 of the build plan) before touching any more code. Ask it to `echo hello` in a sandbox first. This single check tells you whether your remaining time is "polish a working system" or "debug infrastructure."
2. **Fix the two engine.ts bugs together** (D.1 + D.2): consolidate agent registration/instructions into one place, called once, using the real `AUDITOR_INSTRUCTIONS`. This is a small, mechanical, low-risk change and unblocks everything after it.
3. **Run the vertical slice for real** (`agent/run-audit.ts`, or the UI submit flow) against `invoice-server` and get one full, successful, `MISMATCH/HIGH` result on `get_invoice` — this is Phase 27 of the build plan and the single most important milestone left. Do not proceed to anything else until this works at least once, reproducibly.
4. **Read (or have your assistant read) `approve/route.ts` and `events/route.ts` in full**, and fix the approval-timing issue (D.3) so that verdicts/report are only persisted as final/published *after* an Allow decision — or at minimum that a Deny visibly discards/marks the report undone.
5. **Build Server B (`notes-server`)** — small (2 tools, both honestly annotated), and it's the credibility beat your plan calls "high-value." Budget 2–3 hours per the original phase estimate.
6. **Re-run the full flow with both servers**, confirm no cross-contamination, confirm the second-run bug from D.2 is actually fixed by submitting two audits back-to-back from the UI.
7. **Fix the two stale READMEs** (`demo-servers/README.md`, `tests/README.md`) — five minutes, but visible to any judge reading the repo top-down.
8. **If time remains:** Server C (`legacy-server`, the `UNVERIFIABLE` case), Qodo install + retroactive PR discipline going forward, a pre-demo "call `publish_certification` without approval, confirm it pauses" smoke test (§33).
9. **Rehearse the demo** against a clean TrueForge instance/sandbox at least once before recording, with a backup recorded take per §33's own risk mitigation.
10. **Final README pass + submission checklist** (§36) — you're already close here; mostly needs the doc-drift fixes above and a truthful "known limitations" line about Server C / CI if you end up cutting them.

---

## Prioritized 48-hour plan

### P0 — must happen or the submission is at risk (target: next ~12–16 hours)

- [ ] Confirm TrueForge + Daytona sandbox actually work locally (`echo hello` in a sandbox) — pure infra check, do this first.
- [ ] Fix agent registration: one instructions source (`AUDITOR_INSTRUCTIONS`), one registration call, tolerant of "agent already exists."
- [ ] Get **one** fully successful end-to-end run against `invoice-server`, producing a real `MISMATCH/HIGH` verdict on `get_invoice`, persisted correctly, visible in the UI's Evidence Viewer.
- [ ] Verify (by reading the actual files) what `approve/route.ts` and `events/route.ts` do, and fix the approval-timing/persistence issue so Deny has a real, visible effect.
- [ ] Submit a **second** audit run from the UI without restarting anything, and confirm it doesn't fail on duplicate agent registration.

### P1 — needed for the "Winning MVP" you scoped, not just a safe pass (next ~16–24 hours)

- [ ] Build `demo-servers/notes-server` (Server B): `search_notes` (honest read-only), `create_note` (honest write) — both correctly annotated, confirm both come back `VERIFIED`.
- [ ] Run both servers through the full pipeline in the same session; confirm no fixture/port cross-contamination.
- [ ] Fix the two stale "Status: Stub" READMEs (`demo-servers/README.md`, `tests/README.md`).
- [ ] Add the pre-demo safety smoke test: attempt `publish_certification` without going through approval and confirm TrueForge pauses it (per §33).
- [ ] Do at least one full rehearsal run-through of the demo narrative end-to-end.

### P2 — valuable if time allows, explicitly cuttable (final stretch, only after P0/P1 are solid)

- [ ] Build `demo-servers/legacy-server` (Server C, the `UNVERIFIABLE`/no-annotation case).
- [ ] Install Qodo on the GitHub repo and get at least a couple of PRs reviewed/merged through it if you want a shot at the Code Quality track (accept this track is likely a stretch this late — don't let it eat P0/P1 time).
- [ ] Polish the dashboard/history screen, add small UI error states.
- [ ] Add unit tests for the sandbox scripts / API routes beyond what already exists.
- [ ] Record a backup demo take, per the plan's own risk mitigation.

---

*Audit performed by reading source files directly on your machine via the connected-folder bridge (no files modified), plus inspecting the local SQLite run history (`apps/web/.attest-data/attest.db`) and the installed `@truefoundry/trueforge-sdk` package's own API reference to cross-check the code against the real SDK contract. Two files (`approve/route.ts`, `events/route.ts`) could not be opened due to a folder-depth limit in the file bridge and are flagged above as needing your own quick read.*
