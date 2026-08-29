/**
 * Deterministic failure classification for a FAILED audit run.
 *
 * "FAILED" on its own conflates very different situations -- TrueForge
 * being unreachable, the model provider rejecting the request (billing/
 * quota), the sandbox having no provider configured, the target MCP
 * server never starting, a timeout, or something unclassified. A judge
 * (or a developer debugging their own submission) reading `runs.status =
 * FAILED` alone can't tell which; `failure_category` names it.
 *
 * Deliberately pattern-matching on the actual error text, not an LLM
 * call -- this only ever needs to distinguish a small, known set of
 * failure modes we've directly observed running this system (see the
 * comments per branch), and a wrong guess here should never be able to
 * affect a certification verdict. Order matters: first match wins, most
 * specific checks first.
 */

export type FailureCategory =
  | 'TRUEFORGE_UNREACHABLE'
  | 'MODEL_PROVIDER_ERROR'
  | 'SANDBOX_ERROR'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export function classifyFailure(message: string | null | undefined): FailureCategory {
  const m = (message ?? '').toLowerCase();

  // Our own preflight check's message (engine.ts) -- always this exact
  // phrasing, so this is an unambiguous match, not a guess.
  if (m.includes('cannot reach trueforge')) return 'TRUEFORGE_UNREACHABLE';

  // Billing/quota/auth errors from whichever model provider is
  // configured -- observed verbatim from both Anthropic ("credit
  // balance is too low", "workspace-id is required") and Gemini
  // ("exceeded your current quota", 429) during real testing.
  if (
    m.includes('quota') ||
    m.includes('billing') ||
    m.includes('credit balance') ||
    m.includes('rate limit') ||
    m.includes('429') ||
    m.includes('workspace-id')
  ) {
    return 'MODEL_PROVIDER_ERROR';
  }

  // TrueForge's own message when no sandbox provider is registered yet.
  if (m.includes('sandbox') && (m.includes('provider') || m.includes('not configured'))) {
    return 'SANDBOX_ERROR';
  }

  if (m.includes('timeout') || m.includes('timed out')) return 'TIMEOUT';

  // The target MCP server (or a prerequisite for starting it) failed --
  // observed verbatim: "command not found" (Node missing in the sandbox
  // base image), "ERR_MODULE_NOT_FOUND" / "Cannot find module" (a script
  // or dependency missing), non-zero exec exit codes.
  if (
    m.includes('command not found') ||
    m.includes('err_module_not_found') ||
    m.includes('cannot find module') ||
    m.includes('econnrefused') ||
    m.includes('exit code')
  ) {
    return 'SERVER_ERROR';
  }

  return 'UNKNOWN';
}
