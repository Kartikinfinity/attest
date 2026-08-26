/**
 * Attest Auditor — Agent Specification
 *
 * Creates the attest-auditor agent via the TrueForge SDK.
 * This is called once to register the agent, not per-audit.
 *
 * Matches §7 of the build plan exactly:
 * - Uses agents.create (programmatic, not chat UI)
 * - Attaches GitHub MCP server (read-only tools only)
 * - Enables sandbox + dynamic subagents
 * - Explicitly gates publish_certification via require_approval_for_tools
 *
 * Prerequisites:
 * - TrueForge running locally: npx @truefoundry/trueforge@latest
 * - Model configured in TrueForge Settings → Models
 * - GitHub connector added in TrueForge Settings → Connectors
 * - Sandbox provider (Daytona) configured in Settings → Sandbox providers
 */

import { TrueForge } from '@truefoundry/trueforge-sdk';
import { AUDITOR_INSTRUCTIONS } from './prompts/auditor.js';

/**
 * Create a TrueForge client pointed at the local instance.
 * The base URL can be overridden via TRUEFORGE_BASE_URL env var.
 */
export function createClient(): TrueForge {
  return new TrueForge({
    baseUrl: process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790',
  });
}

/**
 * Register the attest-auditor agent with TrueForge.
 *
 * This is idempotent in intent — if the agent already exists,
 * TrueForge will return an error (handle it in the caller).
 */
export async function registerAuditorAgent(client: TrueForge): Promise<void> {
  // First, register the internal MCP connector so the agent can discover it
  await client.settings.mcpServers.createOrUpdate({
    manifest: {
      name: 'attest-internal',
      description: 'Internal Attest verification tools',
      type: 'remote',
      url: 'http://localhost:3009/mcp',
    }
  });

  await client.agents.create({
    name: 'attest-auditor',
    manifest: {
      // Model: use Claude Sonnet for the right balance of reasoning + speed
      model: { name: 'anthropic/claude-sonnet-4-6' },

      // Instructions: imported from prompts/ for easy iteration
      instructions: AUDITOR_INSTRUCTIONS,

      // MCP servers: GitHub (read-only) for repo cloning + internal for publishing
      mcpServers: [
        { name: 'github', enableTools: ['@read-only'] },
        { name: 'attest-internal', requireApprovalForTools: ['publish_certification'] },
      ],

      // Config: enable sandbox isolation + parallel subagent fan-out
      config: {
        sandbox: { enabled: true },
        dynamicSubAgents: { enabled: true },
      },
    },
  });
}

/**
 * Start an audit session for a given MCP server repo.
 *
 * Returns the session ID and an async iterator of streamed events.
 * The caller (the Attest backend API route) persists events as they
 * arrive for the live-run UI and handles the approval gate.
 */
export async function startAuditSession(
  client: TrueForge,
  repoUrl: string,
  fixtureSpecJson: string,
) {
  // Create a fresh session using the registered agent
  const { data: session } = await client.sessions.create({
    agent: { name: 'attest-auditor' },
  });

  // Start the audit turn with the repo + fixture spec
  const stream = await client.sessions.createTurnStream(session.id, {
    input: [{
      type: 'user.message',
      content: `Audit the MCP server at ${repoUrl}. Fixture spec: ${fixtureSpecJson}.`,
    }],
  });

  return { sessionId: session.id, stream };
}

/**
 * Handle the approval gate — resume a paused session after
 * human review of the publish_certification action.
 *
 * Per §7: TrueForge's default gate fails open on unannotated tools.
 * The agent spec explicitly gates publish_certification, so this
 * approval is always required before any certification is published.
 */
export async function handleApproval(
  client: TrueForge,
  sessionId: string,
  pendingApproval: { threadId: string; toolCallId: string },
  decision: { allow: boolean; reason?: string },
) {
  const stream = await client.sessions.createTurnStream(sessionId, {
    input: [{
      type: 'user.tool_approval',
      threadId: pendingApproval.threadId,
      toolCallId: pendingApproval.toolCallId,
      approval: decision.allow
        ? { status: 'allow' }
        : { status: 'deny', reason: decision.reason ?? 'Denied by reviewer' },
    }],
  });

  return stream;
}

// ---------------------------------------------------------------------------
// CLI entry point — run directly to register the agent
// ---------------------------------------------------------------------------
// Usage: npx tsx agent/agent-spec.ts
// ---------------------------------------------------------------------------

const isDirectRun = process.argv[1]?.endsWith('agent-spec.ts') ||
                    process.argv[1]?.endsWith('agent-spec.js');

if (isDirectRun) {
  const client = createClient();
  console.log('Registering attest-auditor agent with TrueForge...');
  console.log(`Target: ${process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790'}`);

  registerAuditorAgent(client)
    .then(() => {
      console.log('✅ attest-auditor agent registered successfully.');
    })
    .catch((err: Error) => {
      console.error('❌ Failed to register agent:', err.message);
      process.exit(1);
    });
}
