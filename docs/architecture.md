# Attest — Architecture Documentation

## Overview

Attest is an execution-based MCP server behavior verification system.

It verifies that an MCP server's declared tool annotations (`readOnlyHint`, `destructiveHint`) match what the tools actually do when executed against a disposable fixture.

## Core Principle

The LLM generates test inputs and human-readable explanations. The **verdict is always deterministic** — a pure function over observed evidence, never an LLM judgment call.

## System Flow

```
Submit server repo + fixture spec
  → Clone & install in isolated sandbox
  → Discover tools via tools/list
  → For each tool (parallel, isolated subagents):
      → Copy fixture (isolation)
      → Start dedicated server instance (own port)
      → Snapshot fixture state (before)
      → Execute one safe test call
      → Snapshot fixture state (after)
      → Produce Evidence object (before/after diff)
  → Run deterministic verdict engine over each Evidence
  → Aggregate into CertificationReport
  → Human approval gate before publishing
```

## Verdict Logic

See `packages/verdict-engine/src/derive-verdict.ts` for the implementation.

## Safety Boundary

Attest only executes code the **submitter** provided (the server) against data the **submitter** provided (the fixture), inside a sandbox neither can see out of. It never reaches a system Attest's own operator doesn't control.

---

> Full details: see `Attest_Master_Build_Plan.md` §6–§11.
