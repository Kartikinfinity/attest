'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { getToolVerdictDisplay } from '../lib/status';

interface ToolResult {
  tool_name: string;
  declared_read_only: boolean | null;
  verdict: string;
  severity: string | null;
}

interface Evidence {
  test_input: unknown;
  before_snapshot: unknown;
  after_snapshot: unknown;
  diff: Array<{ table: string; change: string; rowSummary: string }>;
  raw_response: unknown;
}

function declaredLabel(declaredReadOnly: boolean | null) {
  if (declaredReadOnly === true) return 'Read-only';
  if (declaredReadOnly === false) return 'Read / Write';
  return 'Not declared';
}

function observedLabel(diff: Evidence['diff'] | undefined) {
  if (!diff || diff.length === 0) return 'No state change';
  const n = diff.length;
  return `State modified (${n} change${n === 1 ? '' : 's'})`;
}

function recommendedAction(verdict: string, declaredReadOnly: boolean | null): string | null {
  if (verdict === 'VERIFIED') return null;
  if (verdict === 'MISMATCH' && declaredReadOnly === true) {
    return 'This tool declares readOnlyHint: true but modified state during testing. Update the annotation to readOnlyHint: false, or change the implementation so it doesn’t write when read-only behavior is expected.';
  }
  if (verdict === 'MISMATCH' && declaredReadOnly === false) {
    return 'This tool declares it writes (readOnlyHint: false), but no state change was observed. This could be a test input that didn’t exercise the write path, or an overly cautious annotation — worth a manual look.';
  }
  if (verdict === 'UNVERIFIABLE') {
    return 'No readOnlyHint annotation was declared, so Attest cannot compare declared vs. observed behavior. Add an explicit annotation so this tool can be verified.';
  }
  return null;
}

export function ToolResultCard({ result, evidence }: { result: ToolResult; evidence?: Evidence }) {
  const [expanded, setExpanded] = useState(false);
  const verdictStatus = getToolVerdictDisplay(result.verdict, result.severity);
  const isMismatch = result.verdict === 'MISMATCH';
  const action = recommendedAction(result.verdict, result.declared_read_only);

  return (
    <div
      className={
        'rounded-2xl border bg-white overflow-hidden transition-colors ' +
        (isMismatch ? 'border-red-200' : 'border-neutral-200')
      }
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-neutral-50/60 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="font-mono font-semibold text-neutral-900 truncate">{result.tool_name}</h3>
            <StatusBadge status={verdictStatus} size="sm" />
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-500">
            <span>
              <span className="text-neutral-400">Declared</span>{' '}
              <span className="font-medium text-neutral-700">{declaredLabel(result.declared_read_only)}</span>
            </span>
            <span aria-hidden="true">&rarr;</span>
            <span>
              <span className="text-neutral-400">Observed</span>{' '}
              <span className={'font-medium ' + (isMismatch ? 'text-red-700' : 'text-neutral-700')}>
                {observedLabel(evidence?.diff)}
              </span>
            </span>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-neutral-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {action && (
        <div className="px-6 pb-5 -mt-1">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">Recommended action</p>
            <p className="text-sm text-amber-900/90 leading-relaxed">{action}</p>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-6 py-5 space-y-5">
          {evidence?.diff && evidence.diff.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Observed state changes</h4>
              <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">
                {evidence.diff.map((d, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <span className="font-mono text-neutral-700">{d.table}</span>
                    <span className="text-neutral-400">&middot;</span>
                    <span className="text-neutral-600">{d.rowSummary}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {evidence && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Test input</h4>
                <pre className="bg-white p-4 rounded-xl border border-neutral-200 text-xs overflow-x-auto text-neutral-700 leading-relaxed max-h-64">
                  {JSON.stringify(evidence.test_input, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">Raw response</h4>
                <pre className="bg-white p-4 rounded-xl border border-neutral-200 text-xs overflow-x-auto text-neutral-700 leading-relaxed max-h-64">
                  {JSON.stringify(evidence.raw_response, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {!evidence && (
            <p className="text-sm text-neutral-500">No evidence was recorded for this tool.</p>
          )}
        </div>
      )}
    </div>
  );
}
