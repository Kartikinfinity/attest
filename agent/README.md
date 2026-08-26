# Agent

TrueForge agent definition and prompt templates for the Attest Auditor agent.

## Files

| File | Purpose |
|---|---|
| `agent-spec.ts` | Agent registration + SDK wiring (agents.create, sessions, approval) |
| `smoke-test.ts` | Minimal SDK smoke test — confirms TrueForge connection works |
| `prompts/auditor.ts` | Instruction text for the auditor and tool-tester subagents |

## Usage

### Register the agent (one-time)
```bash
npx tsx agent/agent-spec.ts
```

### Run the smoke test
```bash
npx tsx agent/smoke-test.ts
```

### Prerequisites
1. TrueForge running: `npx @truefoundry/trueforge@latest`
2. Model configured: Settings → Models
3. GitHub connector: Settings → Connectors
4. Sandbox provider: Settings → Sandbox providers → Daytona
