/**
 * Unit tests for classifyFailure() -- a pure, deterministic function, no
 * network/DB. Each case is checked against error text actually observed
 * running this system, not a hypothetical string.
 */

import { describe, it, expect } from 'vitest';
import { classifyFailure } from './failure-classification';

describe('classifyFailure', () => {
  it('classifies our own preflight message as TRUEFORGE_UNREACHABLE', () => {
    const message =
      'Cannot reach TrueForge at http://localhost:8790. Start it with "npx @truefoundry/trueforge@latest" ' +
      'and confirm it is listening before submitting an audit. (underlying error: fetch failed)';
    expect(classifyFailure(message)).toBe('TRUEFORGE_UNREACHABLE');
  });

  it('classifies a Gemini free-tier quota error as MODEL_PROVIDER_ERROR', () => {
    const message =
      'Request failed (429): You exceeded your current quota, please check your plan and billing details. ' +
      'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
      'limit: 20, model: gemini-3.6-flash';
    expect(classifyFailure(message)).toBe('MODEL_PROVIDER_ERROR');
  });

  it('classifies an Anthropic low-credit error as MODEL_PROVIDER_ERROR', () => {
    const message =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
    expect(classifyFailure(message)).toBe('MODEL_PROVIDER_ERROR');
  });

  it('classifies a workspace-id auth error as MODEL_PROVIDER_ERROR', () => {
    const message = "anthropic-workspace-id is required when authenticating with an identity-linked API key";
    expect(classifyFailure(message)).toBe('MODEL_PROVIDER_ERROR');
  });

  it('classifies an unconfigured sandbox provider as SANDBOX_ERROR', () => {
    const message = 'sandbox is enabled but no sandbox provider is configured — PUT /settings/sandbox-providers';
    expect(classifyFailure(message)).toBe('SANDBOX_ERROR');
  });

  it('classifies a missing Node.js in the sandbox as SERVER_ERROR', () => {
    const message = '/usr/bin/bash: line 1: node: command not found';
    expect(classifyFailure(message)).toBe('SERVER_ERROR');
  });

  it('classifies a missing sandbox-scripts module as SERVER_ERROR', () => {
    const message = "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/home/trueforge/sandbox-scripts/discover-tools.ts'";
    expect(classifyFailure(message)).toBe('SERVER_ERROR');
  });

  it('classifies a server-start timeout as TIMEOUT', () => {
    expect(classifyFailure('Server start timeout')).toBe('TIMEOUT');
  });

  it('classifies an empty/unrecognized message as UNKNOWN', () => {
    expect(classifyFailure('')).toBe('UNKNOWN');
    expect(classifyFailure(null)).toBe('UNKNOWN');
    expect(classifyFailure(undefined)).toBe('UNKNOWN');
    expect(classifyFailure('something completely unrelated happened')).toBe('UNKNOWN');
  });
});
