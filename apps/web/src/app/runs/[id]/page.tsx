'use client';
import { useState, useEffect } from 'react';
import { use } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  XCircle,
  GitBranch,
  Clock,
  Hash,
  ChevronDown,
} from 'lucide-react';
import { AppHeader } from '../../../components/AppHeader';
import { StatusBadge } from '../../../components/StatusBadge';
import { AuditProgress } from '../../../components/AuditProgress';
import { ToolResultCard } from '../../../components/ToolResultCard';
import { CopyButton } from '../../../components/CopyButton';
import { getRunDisplayStatus, formatDuration, formatTimestamp, getFailureGuidance } from '../../../lib/status';

interface RunEvent {
  id: number;
  type: string;
  data: any;
  created_at: string;
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [evidenceMap, setEvidenceMap] = useState<any>({});
  const [approvalRequired, setApprovalRequired] = useState<any>(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);

  useEffect(() => {
    fetch(`/api/audits/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRun(data.run);
        setResults(data.results ?? []);
        const eMap: any = {};
        (data.evidence ?? []).forEach((e: any) => {
          eMap[e.tool_name] = e;
        });
        setEvidenceMap(eMap);
      })
      .catch(err => {
        console.error('Failed to fetch audit data:', err);
        setLoadError(err.message ?? 'Failed to load this audit.');
      });

    const eventSource = new EventSource(`/api/audits/${id}/events`);
    eventSource.addEventListener('audit_event', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, data]);
      if (data.type === 'tool.approval_required') {
        setRun((prev: any) => (prev ? { ...prev, status: 'AWAITING_APPROVAL' } : prev));
        setApprovalRequired(data.data);
      }
    });
    eventSource.addEventListener('audit_complete', (e) => {
      const data = JSON.parse(e.data);
      setRun((prev: any) => (prev ? { ...prev, status: data.status } : prev));

      fetch(`/api/audits/${id}`)
        .then(res => res.json())
        .then(fresh => {
          setRun(fresh.run);
          setResults(fresh.results ?? []);
          const eMap: any = {};
          (fresh.evidence ?? []).forEach((e: any) => {
            eMap[e.tool_name] = e;
          });
          setEvidenceMap(eMap);
        })
        .catch(console.error);

      eventSource.close();
    });

    return () => eventSource.close();
  }, [id]);

  const handleCancel = async () => {
    if (cancelPending) return;
    setCancelPending(true);
    try {
      await fetch(`/api/audits/${id}/cancel`, { method: 'POST' });
      // Refetch rather than optimistically setting the status: the server
      // may also have appended an event explaining that TrueForge's own
      // cancel call failed, which the operator needs to see.
      const res = await fetch(`/api/audits/${id}`);
      const fresh = await res.json();
      if (fresh.run) setRun(fresh.run);
    } catch (err) {
      console.error('Cancel failed:', err);
    } finally {
      setCancelPending(false);
    }
  };

  const handleApproval = async (allow: boolean) => {
    if (!approvalRequired || approvalPending) return;
    setApprovalPending(true);
    const pendingCall = approvalRequired.toolCalls?.[0];
    try {
      await fetch(`/api/audits/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow,
          threadId: approvalRequired.threadId,
          toolCallId: pendingCall?.id,
        }),
      });
      setApprovalRequired(null);
      setRun((prev: any) => (prev ? { ...prev, status: 'RUNNING' } : prev));
    } finally {
      setApprovalPending(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <XCircle className="h-10 w-10 text-red-300 mx-auto mb-4" />
          <p className="text-neutral-900 font-semibold mb-1">Couldn&apos;t load this audit</p>
          <p className="text-sm text-neutral-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-canvas p-6">
        <div className="max-w-6xl mx-auto animate-pulse space-y-4">
          <div className="h-6 w-48 bg-neutral-200 rounded" />
          <div className="h-40 bg-neutral-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  const repoName = run.server_dir.split('/').pop();
  const display = getRunDisplayStatus(run);
  const errorEvent = [...events].reverse().find(e => e.type === 'error');
  const isFailed = run.status === 'FAILED';
  // failure_category is classified deterministically server-side (see
  // apps/web/lib/failure-classification.ts); this maps it to actionable
  // guidance so a failed run explains itself instead of showing a raw
  // provider error string and a generic list of maybe-causes.
  const guidance = getFailureGuidance(run.failure_category);
  const isRunningState = run.status === 'PENDING' || run.status === 'RUNNING' || run.status === 'AWAITING_APPROVAL';
  const passed = results.filter(r => r.verdict === 'VERIFIED').length;
  const failed = results.filter(r => r.verdict === 'MISMATCH' && r.severity === 'HIGH').length;
  const warnings = results.filter(r => (r.verdict === 'MISMATCH' && r.severity !== 'HIGH') || r.verdict === 'UNVERIFIABLE').length;

  return (
    <div className="min-h-screen bg-canvas text-neutral-900">
      <AppHeader>
        <span className="text-neutral-600 hidden sm:inline">/</span>
        <h1 className="font-mono font-semibold text-neutral-100 truncate hidden sm:inline">{repoName}</h1>
        <StatusBadge status={display} />
      </AppHeader>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        {/* Overview card */}
        <OverviewCard run={run} passed={passed} failed={failed} warnings={warnings} toolsTested={results.length} />

        {/* Running / awaiting-approval progress */}
        {isRunningState && (
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Audit Progress</h3>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelPending}
                className="text-xs font-semibold text-neutral-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-md border border-neutral-200 hover:border-red-200 transition-colors disabled:opacity-60 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-accent flex-shrink-0"
              >
                {cancelPending ? 'Cancelling…' : 'Cancel audit'}
              </button>
            </div>
            <AuditProgress status={run.status} events={events} />
          </div>
        )}

        {/* Approval gate */}
        {approvalRequired && (
          <div className="bg-accent-soft/60 border border-accent/30 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-5">
              <ShieldAlert className="h-10 w-10 text-accent mt-1 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-neutral-900 mb-2">Certification Ready</h3>
                <p className="text-neutral-600 mb-6 font-medium">
                  The agent wants to publish this audit result. Review the findings below before publishing.
                </p>

                <div className="bg-white rounded-xl border border-accent/20 p-5 mb-6 font-mono text-sm text-neutral-800 shadow-sm">
                  <span className="text-neutral-400 block mb-2">{'// Action requested'}</span>
                  publish_certification
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => handleApproval(true)}
                    disabled={approvalPending}
                    className="min-h-[44px] bg-accent hover:bg-accent-hover text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent"
                  >
                    Publish Report
                  </button>
                  <button
                    onClick={() => handleApproval(false)}
                    disabled={approvalPending}
                    className="min-h-[44px] bg-white text-neutral-900 hover:bg-neutral-50 px-6 py-2.5 rounded-lg font-semibold text-sm border border-neutral-300 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent"
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancelled — a deliberate operator action, not a malfunction, so
            it gets neutral styling and keeps whatever evidence was gathered. */}
        {run.status === 'CANCELLED' && (
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8">
            <h3 className="text-lg font-bold text-neutral-900 mb-1">Audit cancelled</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              This run was stopped by an operator before it finished. Any evidence collected before
              the stop is shown below and is still valid — but the audit is incomplete, so no
              certification was produced.
            </p>
          </div>
        )}

        {/* Failure card */}
        {isFailed && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="bg-red-50 p-2.5 rounded-full flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-neutral-900 mb-1">
                  {guidance?.title ?? 'Audit failed'}
                </h3>
                <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
                  {guidance?.explanation ??
                    'The audit did not complete. This is an execution failure — it is not a finding about the server being audited.'}
                </p>

                {errorEvent && (
                  <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-red-900/70 uppercase tracking-widest mb-1.5">
                      Reported error
                    </p>
                    <p className="text-sm text-red-800 font-mono leading-relaxed break-words">
                      {errorEvent.data?.message ?? 'Unknown error'}
                    </p>
                  </div>
                )}

                {guidance ? (
                  <>
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">
                      How to fix this
                    </p>
                    {/* list-outside + pl, not list-inside: with list-inside a
                        wrapped step aligns back under its own bullet instead
                        of hanging-indenting, which reads as a new item. */}
                    <ul className="text-sm text-neutral-600 space-y-1.5 list-disc list-outside pl-5 marker:text-neutral-300">
                      {guidance.nextSteps.map(step => (
                        <li key={step} className="leading-relaxed break-words">{step}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">
                    This failure could not be matched to a known cause. Check the raw execution log below
                    for the last step that ran.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tool-by-tool results */}
        {results.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold tracking-tight mb-4">Tool-by-Tool Results</h3>
            <div className="space-y-3">
              {results.map(r => (
                <ToolResultCard key={r.id} result={r} evidence={evidenceMap[r.tool_name]} />
              ))}
            </div>
          </div>
        )}

        {/* Raw execution log -- progressive disclosure */}
        {events.length > 0 && (
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRawLog(v => !v)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-neutral-50 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              aria-expanded={showRawLog}
            >
              <span className="text-sm font-semibold text-neutral-700">Raw execution log ({events.length} events)</span>
              <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${showRawLog ? 'rotate-180' : ''}`} />
            </button>
            {showRawLog && (
              <div className="border-t border-neutral-200 bg-neutral-950 text-neutral-300 font-mono text-xs px-6 py-5 overflow-x-auto max-h-96 overflow-y-auto">
                {events.map(e => (
                  <div key={e.id} className="mb-3 pb-3 border-b border-neutral-800 last:border-0">
                    <div className="text-neutral-500 mb-1">
                      {e.type} &middot; {formatTimestamp(e.created_at)}
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-neutral-400">
                      {JSON.stringify(e.data, null, 2).slice(0, 2000)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function OverviewCard({
  run,
  passed,
  failed,
  warnings,
  toolsTested,
}: {
  run: any;
  passed: number;
  failed: number;
  warnings: number;
  toolsTested: number;
}) {
  const isTerminal = run.status === 'COMPLETED' || run.status === 'FAILED';

  let headline: { icon: typeof ShieldCheck; text: string; tone: string; bar: string } | null = null;
  if (run.status === 'COMPLETED') {
    if (run.overall_verdict === 'CERTIFIED') {
      headline = { icon: ShieldCheck, text: 'Certified', tone: 'text-emerald-600', bar: 'bg-emerald-500' };
    } else if (run.overall_verdict === 'FLAGGED') {
      headline = { icon: ShieldX, text: 'Flagged', tone: 'text-red-600', bar: 'bg-red-500' };
    } else if (run.overall_verdict === 'DENIED') {
      headline = { icon: ShieldQuestion, text: 'Publish Denied', tone: 'text-neutral-500', bar: 'bg-neutral-400' };
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      {headline && <div className={`h-1 ${headline.bar}`} aria-hidden="true" />}
      <div className="p-6 sm:p-8">
      {headline && (
        <div className="flex items-center gap-3 mb-6">
          <headline.icon className={`h-8 w-8 ${headline.tone}`} aria-hidden="true" />
          <div>
            <h2 className={`text-2xl font-extrabold tracking-tight ${headline.tone}`}>{headline.text}</h2>
            <p className="text-sm text-neutral-500">
              {run.overall_verdict === 'CERTIFIED' && 'Behavior matches declared MCP annotations.'}
              {run.overall_verdict === 'FLAGGED' && 'One or more tools do not match their declared behavior.'}
              {run.overall_verdict === 'DENIED' && 'Certification was reviewed and not published.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2 text-neutral-500">
            <GitBranch className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="font-mono truncate">{run.repo_url}</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-500">
            <Hash className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="font-mono truncate">{run.server_dir}</span>
          </div>
          <div className="flex items-center gap-2 text-neutral-500">
            <Clock className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              {formatTimestamp(run.created_at)}
              {isTerminal && <> &middot; {formatDuration(run.created_at, run.updated_at)}</>}
            </span>
          </div>
          {run.session_id && (
            <div className="flex items-center gap-1 text-neutral-400 text-xs pt-1">
              <span className="font-mono">{run.session_id}</span>
              <CopyButton value={run.session_id} label="Copy session ID" />
            </div>
          )}
        </div>

        {toolsTested > 0 && (
          <div className="grid grid-cols-4 gap-3 sm:justify-items-end">
            <Metric label="Tested" value={toolsTested} />
            <Metric label="Passed" value={passed} tone="text-emerald-600" />
            <Metric label="Warnings" value={warnings} tone="text-amber-600" />
            <Metric label="Failed" value={failed} tone="text-red-600" />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'text-neutral-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="text-center sm:text-right">
      <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-neutral-400 uppercase tracking-wide">{label}</p>
    </div>
  );
}
