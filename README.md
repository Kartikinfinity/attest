# ATTEST

**Execution-based MCP server behavior verification.**

> *"MCP servers should prove what their tools actually do — not be trusted based only on their declarations."*

## What Is This?

Attest is a verification system for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. It starts your MCP server in an isolated sandbox, actually calls each of its tools against a throwaway test database, and tells you — with the before/after evidence attached — whether its safety annotations match what it actually did.

### The Problem

MCP tool annotations like `readOnlyHint` and `destructiveHint` are the trust boundary every approval-gated harness relies on — and nothing checks whether they're true. A tool can declare `readOnlyHint: true` while silently writing to a database on every call.

### The Solution

Attest catches this by **executing** tools and **observing** what actually happens, then running a deterministic verdict engine over the evidence. The LLM never decides the final verdict — a pure function does, based on before/after state diffs.

## Architecture

```
attest/
├── apps/web/                  # Next.js app: UI + API routes
├── agent/                     # TrueForge agent definition + prompts
├── sandbox-scripts/           # Code Mode scripts for sandbox execution
├── demo-servers/              # Purpose-built MCP servers for testing
│   ├── invoice-server/        # Server A — planted readOnly mismatch
│   ├── notes-server/          # Server B — correctly annotated
│   └── legacy-server/         # Server C — no annotations (optional)
├── packages/
│   └── verdict-engine/        # Pure, deterministic verdict logic
├── tests/                     # Integration/e2e tests
└── docs/                      # Architecture documentation
```

## Key Concepts

- **Verdict Engine** — A deterministic function (not an LLM) that compares declared annotations against observed before/after state changes.
- **Evidence** — Fixture snapshots taken before and after each tool call, producing a concrete diff.
- **Demo Servers** — Purpose-built MCP servers with known behaviors (including a planted mismatch) for verifiable testing.

## Verdict Logic

| Declared `readOnlyHint` | Observed State Change | Verdict |
|---|---|---|
| `true` | No change | ✅ VERIFIED |
| `true` | Change detected | 🔴 MISMATCH (HIGH) |
| `false` | No change | 🟡 MISMATCH (MEDIUM) |
| `false` | Change detected | ✅ VERIFIED |
| `undefined` | Any | ⚪ UNVERIFIABLE |

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm run dev
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

See [.env.example](.env.example) for required variables.

## Tech Stack

- **Frontend/Backend:** Next.js + TypeScript
- **Agent Runtime:** TrueForge (agent orchestration + sandbox)
- **Verdict Engine:** Pure TypeScript (no LLM dependency)
- **Testing:** Vitest
- **Database:** SQLite (lightweight persistence)

## Development Status

🚧 **Active development — hackathon MVP in progress.**

## AI Disclosure

This project uses AI coding assistants (Claude, Cursor, Antigravity) during development. All architectural decisions are understood and can be explained by the team.

## License

[MIT](LICENSE)
