/**
 * Attest Auditor — Agent Specification
 *
 * Creates the attest-auditor agent via the TrueForge SDK.
 * This is called once to register the agent, not per-audit.
 *
 * Matches §7 of the build plan exactly:
 * - Uses agents.create (programmatic, not chat UI)
 * - Enables sandbox + dynamic subagents
 * - Explicitly gates publish_certification via require_approval_for_tools
 *
 * Prerequisites:
 * - TrueForge running locally: npx @truefoundry/trueforge@latest
 * - Model configured in TrueForge Settings → Models
 * - Sandbox provider (Daytona, or the built-in local fallback on macOS/Linux)
 *   configured in Settings → Sandbox providers
 */

import { TrueForge } from '@truefoundry/trueforge-sdk';
import { buildAuditorManifest } from '@attest/agent-prompts';

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

  // Manifest (model, instructions, MCP servers, sandbox/subagent/iteration
  // config) comes from the single shared builder in packages/agent-prompts.
  // Model name and iteration limit are read from ATTEST_MODEL_NAME /
  // ATTEST_ITERATION_LIMIT env vars, so switching providers (e.g. to a local
  // DGX Spark endpoint registered in TrueForge as a `custom` model provider,
  // or back to Anthropic once billing is set up) never needs a code change.
  const manifest = buildAuditorManifest();

  try {
    await client.agents.create({ name: 'attest-auditor', manifest });
    console.log('   (created a new attest-auditor agent)');
  } catch (err: any) {
    if (err?.statusCode !== 409) throw err;

    // Already exists -- reconcile its manifest rather than leaving it stale.
    // agents.create's name is immutable, but an agent created before a
    // prompt or model change would otherwise keep running the old manifest
    // forever, silently ignoring edits to AUDITOR_INSTRUCTIONS or
    // ATTEST_MODEL_NAME. Re-running this command is the documented way to
    // apply such a change, so it has to actually apply it.
    const { data: agents } = await client.agents.list();
    const existing = agents.find(a => a.name === 'attest-auditor');
    if (!existing) throw err;

    await client.agents.update(existing.id, { manifest });
    console.log('   (updated the existing attest-auditor agent in place)');
  }
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
