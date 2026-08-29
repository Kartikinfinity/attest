/**
 * Single source of truth for how run/verdict status maps to a label, a
 * semantic tone, and whether it should read as "in progress." Used by
 * every status badge across the dashboard and run-detail page so the
 * same state always looks the same everywhere.
 */

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface RunLike {
  status: 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
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

/** Formats an ms duration as e.g. "42s", "2m 14s", "1h 05m". Truthful --
 * only ever called with real created_at/updated_at timestamps. */
export function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
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
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
