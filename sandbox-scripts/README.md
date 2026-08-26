# Sandbox Scripts

Code Mode scripts that run inside the TrueForge/Daytona sandbox during an audit.

## Structure (planned)

```
sandbox-scripts/
├── discover-tools.ts     # Clone repo, install deps, start server, list tools
└── test-tool.ts          # Per-subagent: one tool test call + fixture diff
```

> **Status:** Stub — implementation comes in Phase 4-5 (PR #4).
> These scripts will make raw HTTP calls to the target MCP server (not TrueForge MCP attachment — see §0 of the build plan).
