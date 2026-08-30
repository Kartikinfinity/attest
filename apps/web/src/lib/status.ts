/**
 * Single source of truth for how run/verdict status maps to a label, a
 * semantic tone, and whether it should read as "in progress." Used by
 * every status badge across the dashboard and run-detail page so the
 * same state always looks the same everywhere.
 */

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface RunLike {
  status: 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  overall_verdict: string | null;
}

export interface DisplayStatus {
  label: string;
  tone: StatusTone;
  pulsing: boolean;
}

export function getRunDisplayStatus(run: RunLike): DisplayStatus {
  switch (run.status) {
    case 'FAILED':
      return { label: 'Audit Failed', tone: 'danger', pulsing: false };
    // Neutral, not danger: an operator stopping a run is a deliberate
    // control action, not a malfunction.
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'neutral', pulsing: false };
    case 'PENDING':
      return { label: 'Starting', tone: 'info', pulsing: true };
    case 'RUNNING':
      return { label: 'Running', tone: 'info', pulsing: true };
    case 'AWAITING_APPROVAL':
      return { label: 'Awaiting Review', tone: 'warning', pulsing: true };
    case 'COMPLETED':
      switch (run.overall_verdict) {
        case 'CERTIFIED':
          return { label: 'Certified', tone: 'success', pulsing: false };
        case 'FLAGGED':
          return { label: 'Flagged', tone: 'danger', pulsing: false };
        case 'DENIED':
          return { label: 'Publish Denied', tone: 'neutral', pulsing: false };
        default:
          return { label: 'Completed', tone: 'neutral', pulsing: false };
      }
    default:
      return { label: run.status, tone: 'neutral', pulsing: false };
  }
}

export function getToolVerdictDisplay(verdict: string, severity: string | null): DisplayStatus {
  switch (verdict) {
    case 'VERIFIED':
      return { label: 'Verified', tone: 'success', pulsing: false };
    case 'MISMATCH':
      return severity === 'HIGH'
        ? { label: 'Mismatch · High', tone: 'danger', pulsing: false }
        : { label: 'Mismatch · Medium', tone: 'warning', pulsing: false };
    case 'UNVERIFIABLE':
      return { label: 'Unverifiable', tone: 'warning', pulsing: false };
    default:
      return { label: verdict || 'Unknown', tone: 'neutral', pulsing: false };
  }
}

/**
 * Human-readable guidance for a classified failure. The category itself is
 * derived deterministically in apps/web/lib/failure-classification.ts from
 * the real error text -- this only maps that category to what a developer
 * should actually DO about it, so a failed run answers "what happened /
 * why / what next" instead of dumping a raw provider error string.
 */
export interface FailureGuidance {
  title: string;
  explanation: string;
  nextSteps: string[];
}

const FAILURE_GUIDANCE: Record<string, FailureGuidance> = {
  TRUEFORGE_UNREACHABLE: {
    title: 'Could not reach TrueForge',
    explanation:
      'Attest reached its own preflight check and could not connect to the TrueForge instance that runs the audit. Nothing was executed.',
    nextSteps: [
      'Start TrueForge: npx @truefoundry/trueforge@latest',
      'Confirm it is listening on the URL in TRUEFORGE_BASE_URL (default http://localhost:8790)',
      'On Windows, run TrueForge from WSL2 — its standalone server does not start on native Windows',
    ],
  },
  MODEL_PROVIDER_ERROR: {
    title: 'The model provider rejected the request',
    explanation:
      'TrueForge was reachable and the audit started, but the configured model provider refused to answer — typically a billing, quota, or API-key problem rather than anything wrong with the server being audited.',
    nextSteps: [
      'Check the credit balance / rate limits on the provider configured in TrueForge → Settings → Models',
      'If you switched providers, set ATTEST_MODEL_NAME to match and re-register the agent (delete attest-auditor in TrueForge first — its model is fixed at registration time)',
      'Free-tier models often cap requests per minute; an audit needs several in quick succession',
    ],
  },
  SANDBOX_ERROR: {
    title: 'The sandbox could not be provisioned',
    explanation:
      'The auditor agent requires an isolated sandbox to run the submitted server in, and TrueForge could not provide one.',
    nextSteps: [
      'Add a Daytona API key in TrueForge → Settings → Sandbox providers',
      "TrueForge's built-in local sandbox fallback is macOS/Linux only — on Windows a Daytona provider is required",
    ],
  },
  SERVER_ERROR: {
    title: 'The target server failed to start in the sandbox',
    explanation:
      'The sandbox came up, but the MCP server being audited (or a prerequisite for starting it) failed before tools could be discovered.',
    nextSteps: [
      'Confirm the server directory path is correct and contains a package.json with a "start" script',
      'Confirm the server starts locally with npm install && npm run start',
      'Check the raw execution log below for the exact command that failed',
    ],
  },
  TIMEOUT: {
    title: 'The audit timed out',
    explanation:
      'A step took longer than its allowed window — most often the target server not becoming reachable before the startup deadline.',
    nextSteps: [
      'Check whether the server takes an unusually long time to install dependencies or boot',
      'Check the raw execution log below for the step that stalled',
    ],
  },
};

export function getFailureGuidance(category: string | null | undefined): FailureGuidance | null {
  if (!category) return null;
  return FAILURE_GUIDANCE[category] ?? null;
}

const TONE_CLASSES: Record<StatusTone, { bg: string; text: string; ring: string; dot: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/20', dot: 'bg-emerald-500' },
  danger: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-600/20', dot: 'bg-red-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-800', ring: 'ring-amber-600/20', dot: 'bg-amber-500' },
  info: { bg: 'bg-accent-soft', text: 'text-accent-hover', ring: 'ring-accent/20', dot: 'bg-accent' },
  neutral: { bg: 'bg-neutral-100', text: 'text-neutral-600', ring: 'ring-neutral-500/15', dot: 'bg-neutral-400' },
};

export function toneClasses(tone: StatusTone) {
  return TONE_CLASSES[tone];
}

/**
 * Parse a timestamp that may come from SQLite.
 *
 * SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC, with no
 * timezone marker and a space instead of "T". Passing that straight to
 * `new Date()` makes engines interpret it as LOCAL time, so every timestamp
 * rendered in the UI was wrong by the viewer's UTC offset (a run created at
 * 09:26 local displayed as 03:56). Normalise to explicit UTC first.
 * Genuine ISO strings already carry an offset and are passed through.
 */
function parseTimestamp(value: string): Date {
  const isSqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);
  return new Date(isSqliteUtc ? `${value.replace(' ', 'T')}Z` : value);
}

/** Formats an ms duration as e.g. "42s", "2m 14s", "1h 05m". Truthful --
 * only ever called with real created_at/updated_at timestamps. */
export function formatDuration(startIso: string, endIso: string): string {
  const start = parseTimestamp(startIso).getTime();
  const end = parseTimestamp(endIso).getTime();
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));

  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${String(remMinutes).padStart(2, '0')}m`;
}

export function formatTimestamp(iso: string): string {
  return parseTimestamp(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Minutes since the given timestamp. Used to detect a run that is nominally
 * RUNNING but has produced no new events for a while -- i.e. wedged.
 */
export function minutesSince(timestamp: string): number {
  return (Date.now() - parseTimestamp(timestamp).getTime()) / 60000;
}
