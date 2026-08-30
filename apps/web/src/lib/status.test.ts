/**
 * Tests for the display-layer status helpers.
 *
 * The most valuable test here is the cross-file consistency check at the
 * bottom: classifyFailure() (server-side, apps/web/lib/) and
 * getFailureGuidance() (client-side, here) are two files that must agree
 * on the same set of category strings. If they drift -- e.g. someone adds
 * a new failure category to the classifier without adding guidance for it
 * -- nothing throws; a failed audit just silently degrades to the generic
 * "could not be matched to a known cause" fallback. That is exactly the
 * kind of regression that survives code review, so it is pinned here.
 */

import { describe, it, expect } from 'vitest';
import { getRunDisplayStatus, getToolVerdictDisplay, getFailureGuidance, formatDuration, formatTimestamp, minutesSince } from './status';
import { classifyFailure } from '../../lib/failure-classification';

describe('getRunDisplayStatus', () => {
  it('reports a completed+certified run as success', () => {
    const s = getRunDisplayStatus({ status: 'COMPLETED', overall_verdict: 'CERTIFIED' });
    expect(s.tone).toBe('success');
    expect(s.pulsing).toBe(false);
  });

  it('reports a completed+flagged run as danger, not success', () => {
    const s = getRunDisplayStatus({ status: 'COMPLETED', overall_verdict: 'FLAGGED' });
    expect(s.tone).toBe('danger');
  });

  // A denied publish is NOT a failed audit -- the audit ran fine, a human
  // declined to publish it. It must not read as an error state.
  it('distinguishes a denied publish from a failed run', () => {
    const denied = getRunDisplayStatus({ status: 'COMPLETED', overall_verdict: 'DENIED' });
    const failed = getRunDisplayStatus({ status: 'FAILED', overall_verdict: null });
    expect(denied.tone).toBe('neutral');
    expect(failed.tone).toBe('danger');
    expect(denied.label).not.toBe(failed.label);
  });

  // An operator stopping a run is a control action, not a malfunction. It
  // must not render as an error, and must not be confused with a denied
  // publish (which means the audit DID complete and was reviewed).
  it('renders a cancelled run as neutral, distinct from failed and denied', () => {
    const cancelled = getRunDisplayStatus({ status: 'CANCELLED', overall_verdict: null });
    const failed = getRunDisplayStatus({ status: 'FAILED', overall_verdict: null });
    const denied = getRunDisplayStatus({ status: 'COMPLETED', overall_verdict: 'DENIED' });

    expect(cancelled.tone).toBe('neutral');
    expect(cancelled.pulsing).toBe(false);
    expect(cancelled.tone).not.toBe(failed.tone);
    expect(cancelled.label).not.toBe(denied.label);
  });

  it('marks in-flight states as pulsing', () => {
    expect(getRunDisplayStatus({ status: 'RUNNING', overall_verdict: null }).pulsing).toBe(true);
    expect(getRunDisplayStatus({ status: 'AWAITING_APPROVAL', overall_verdict: null }).pulsing).toBe(true);
  });

  // A run that completed but was never scored shouldn't claim certification.
  it('does not imply certification when overall_verdict is null', () => {
    const s = getRunDisplayStatus({ status: 'COMPLETED', overall_verdict: null });
    expect(s.tone).toBe('neutral');
    expect(s.label).toBe('Completed');
  });
});

describe('getToolVerdictDisplay', () => {
  it('separates HIGH from MEDIUM severity mismatches', () => {
    expect(getToolVerdictDisplay('MISMATCH', 'HIGH').tone).toBe('danger');
    expect(getToolVerdictDisplay('MISMATCH', 'MEDIUM').tone).toBe('warning');
  });

  it('treats UNVERIFIABLE as a warning, not a pass or a failure', () => {
    expect(getToolVerdictDisplay('UNVERIFIABLE', null).tone).toBe('warning');
  });
});

describe('formatDuration', () => {
  it('formats sub-minute, minute, and hour durations', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:42Z')).toBe('42s');
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:02:14Z')).toBe('2m 14s');
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T01:05:00Z')).toBe('1h 05m');
  });

  // created_at and updated_at come from SQLite CURRENT_TIMESTAMP; clock
  // skew or an unwritten updated_at must not render "-3s".
  it('never renders a negative duration', () => {
    expect(formatDuration('2026-01-01T00:00:10Z', '2026-01-01T00:00:00Z')).toBe('0s');
  });

  // Regression: SQLite emits "YYYY-MM-DD HH:MM:SS" in UTC with no zone
  // marker. Passed raw to new Date() that is read as LOCAL time, so a
  // duration spanning two SQLite timestamps was still correct (both shifted
  // equally) but any absolute time rendered was off by the viewer's UTC
  // offset. Both formats must agree.
  it('treats bare SQLite timestamps as UTC, matching the ISO equivalent', () => {
    const sqlite = formatDuration('2026-08-30 03:52:18', '2026-08-30 03:54:32');
    const iso = formatDuration('2026-08-30T03:52:18Z', '2026-08-30T03:54:32Z');
    expect(sqlite).toBe('2m 14s');
    expect(sqlite).toBe(iso);
  });
});

describe('formatTimestamp', () => {
  // The user-visible symptom of the bug above: a run created at 09:26 local
  // (03:56 UTC) rendered as "03:56". Pinning that a bare SQLite timestamp
  // and its explicit-UTC equivalent format identically.
  it('renders a bare SQLite timestamp the same as explicit UTC', () => {
    expect(formatTimestamp('2026-08-30 03:52:18')).toBe(formatTimestamp('2026-08-30T03:52:18Z'));
  });
});

describe('minutesSince', () => {
  it('measures elapsed minutes from a SQLite timestamp', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    expect(minutesSince(tenMinutesAgo)).toBeGreaterThan(9.5);
    expect(minutesSince(tenMinutesAgo)).toBeLessThan(10.5);
  });
});

describe('failure guidance ↔ classifier consistency', () => {
  // Every category the classifier can actually emit (except UNKNOWN, which
  // is the deliberate catch-all with no specific advice) must have UI
  // guidance behind it.
  const REAL_ERRORS: Array<[string, string]> = [
    ['Cannot reach TrueForge at http://localhost:8790', 'TRUEFORGE_UNREACHABLE'],
    ['Request failed (429): You exceeded your current quota', 'MODEL_PROVIDER_ERROR'],
    ['sandbox is enabled but no sandbox provider is configured', 'SANDBOX_ERROR'],
    ['/usr/bin/bash: line 1: node: command not found', 'SERVER_ERROR'],
    ['Server start timeout', 'TIMEOUT'],
  ];

  it.each(REAL_ERRORS)('classifies %s and has guidance for it', (message, expectedCategory) => {
    const category = classifyFailure(message);
    expect(category).toBe(expectedCategory);

    const guidance = getFailureGuidance(category);
    expect(guidance, `no UI guidance defined for category ${category}`).not.toBeNull();
    expect(guidance!.title.length).toBeGreaterThan(0);
    expect(guidance!.explanation.length).toBeGreaterThan(0);
    expect(guidance!.nextSteps.length).toBeGreaterThan(0);
  });

  it('returns null for UNKNOWN and for a missing category', () => {
    expect(getFailureGuidance('UNKNOWN')).toBeNull();
    expect(getFailureGuidance(null)).toBeNull();
    expect(getFailureGuidance(undefined)).toBeNull();
  });
});
