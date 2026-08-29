/**
 * Unit tests for buildAuditorManifest() -- the single source of truth for
 * the attest-auditor agent's manifest, shared by the CLI path
 * (agent/agent-spec.ts) and the web app path (apps/web/lib/engine.ts).
 *
 * Pure function, no network/DB -- these run without TrueForge, a sandbox,
 * or any real audit.
 */

import { describe, it, expect } from 'vitest';
// @ts-ignore -- plain JS module, no .d.ts resolution quirk relevant here
import { buildAuditorManifest, AUDITOR_INSTRUCTIONS } from './index.js';

describe('buildAuditorManifest', () => {
  it('uses the documented defaults when no env vars are set', () => {
    const manifest = buildAuditorManifest({});
    expect(manifest.model.name).toBe('anthropic/claude-sonnet-4-6');
    expect(manifest.config.iterationLimit).toBe(60);
  });

  // This is the DGX Spark / provider-swap mechanism in practice: pointing
  // the agent at a local inference endpoint is a config change (this env
  // var), never a code change.
  it('reads the model name from ATTEST_MODEL_NAME', () => {
    const manifest = buildAuditorManifest({ ATTEST_MODEL_NAME: 'custom/dgx-spark-local' });
    expect(manifest.model.name).toBe('custom/dgx-spark-local');
  });

  it('reads the iteration cap from ATTEST_ITERATION_LIMIT', () => {
    const manifest = buildAuditorManifest({ ATTEST_ITERATION_LIMIT: '25' });
    expect(manifest.config.iterationLimit).toBe(25);
  });

  it('always gates publish_certification behind approval, regardless of env', () => {
    const manifest = buildAuditorManifest({ ATTEST_MODEL_NAME: 'anything' });
    const attestInternal = manifest.mcpServers.find((s: any) => s.name === 'attest-internal');
    expect(attestInternal?.requireApprovalForTools).toContain('publish_certification');
  });

  // Regression check: an unconfigured `github` MCP entry once blocked
  // agent registration entirely with a 422 (nothing in the execution path
  // actually calls it -- cloning is a plain `git clone` in the sandbox).
  it('never declares an mcpServers entry for github', () => {
    const manifest = buildAuditorManifest({});
    expect(manifest.mcpServers.find((s: any) => s.name === 'github')).toBeUndefined();
  });

  it('always enables sandbox + dynamic subagents', () => {
    const manifest = buildAuditorManifest({});
    expect(manifest.config.sandbox.enabled).toBe(true);
    expect(manifest.config.dynamicSubAgents.enabled).toBe(true);
  });

  // Regression check for the D.1 instructions-drift bug: engine.ts once
  // hardcoded a one-line stub instead of importing the real instructions.
  it('uses the real AUDITOR_INSTRUCTIONS, not a stub', () => {
    const manifest = buildAuditorManifest({});
    expect(manifest.instructions).toBe(AUDITOR_INSTRUCTIONS);
    expect(manifest.instructions.length).toBeGreaterThan(500);
  });
});
