'use client';
import { ShieldCheck, ShieldX, ShieldQuestion, ShieldAlert, Printer } from 'lucide-react';
import { formatTimestamp, formatDuration } from '../lib/status';

interface ToolResult {
  id: number;
  tool_name: string;
  declared_read_only: boolean | null;
  verdict: string;
  severity: string | null;
}

interface Run {
  id: string;
  repo_url: string;
  server_dir: string;
  overall_verdict: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The certificate: the actual deliverable of an audit.
 *
 * Everything shown here is derived from persisted evidence and the
 * deterministic verdict engine -- no text on this page is written by the
 * model. That is the whole claim of the product, so the page states the
 * basis of the result rather than only its conclusion.
 */
export function Certificate({ run, results }: { run: Run; results: ToolResult[] }) {
  const verdict = run.overall_verdict;

  const passed = results.filter(r => r.verdict === 'VERIFIED').length;
  const failed = results.filter(r => r.verdict === 'MISMATCH' && r.severity === 'HIGH').length;
  const warnings = results.filter(
    r => (r.verdict === 'MISMATCH' && r.severity !== 'HIGH') || r.verdict === 'UNVERIFIABLE'
  ).length;

  const mismatches = results.filter(r => r.verdict === 'MISMATCH');
  const repoName = run.server_dir.split('/').pop();

  const style =
    verdict === 'CERTIFIED'
      ? { Icon: ShieldCheck, label: 'CERTIFIED', accent: 'text-emerald-600', bar: 'bg-emerald-500', ring: 'ring-emerald-600/20', bg: 'bg-emerald-50' }
      : verdict === 'FLAGGED'
        ? { Icon: ShieldX, label: 'FLAGGED', accent: 'text-red-600', bar: 'bg-red-500', ring: 'ring-red-600/20', bg: 'bg-red-50' }
        : verdict === 'DENIED'
          ? { Icon: ShieldQuestion, label: 'PUBLISH DENIED', accent: 'text-neutral-600', bar: 'bg-neutral-400', ring: 'ring-neutral-500/20', bg: 'bg-neutral-100' }
          : { Icon: ShieldAlert, label: 'UNSCORED', accent: 'text-amber-600', bar: 'bg-amber-500', ring: 'ring-amber-600/20', bg: 'bg-amber-50' };

  const headline =
    verdict === 'CERTIFIED'
      ? 'Every tool behaved exactly as it declared.'
      : verdict === 'FLAGGED'
        ? `${mismatches.length} tool${mismatches.length === 1 ? '' : 's'} did not behave as declared.`
        : verdict === 'DENIED'
          ? 'A reviewer declined to publish this certification.'
          : 'The audit ran, but no verdicts could be derived.';

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden print:border-0 print:shadow-none">
      <div className={`h-1.5 ${style.bar}`} aria-hidden="true" />

      <div className="px-6 sm:px-10 py-8 sm:py-10">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div className="flex items-start gap-4 min-w-0">
            <style.Icon className={`h-12 w-12 flex-shrink-0 ${style.accent}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.2em] text-neutral-400 uppercase mb-1">
                Certificate of Behavioral Verification
              </p>
              <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${style.accent}`}>
                {style.label}
              </h1>
              <p className="text-neutral-600 mt-1.5 text-base">{headline}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-300 rounded-lg px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> Save as PDF
          </button>
        </div>

        {/* Subject of the certificate */}
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm mb-8 pb-8 border-b border-neutral-100">
          <div className="flex gap-3">
            <dt className="text-neutral-400 w-28 flex-shrink-0">Server</dt>
            <dd className="font-mono font-medium text-neutral-900 truncate">{repoName}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-neutral-400 w-28 flex-shrink-0">Repository</dt>
            <dd className="font-mono text-neutral-700 truncate">{run.repo_url}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-neutral-400 w-28 flex-shrink-0">Directory</dt>
            <dd className="font-mono text-neutral-700 truncate">{run.server_dir}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-neutral-400 w-28 flex-shrink-0">Audited</dt>
            <dd className="text-neutral-700">
              {formatTimestamp(run.created_at)} · {formatDuration(run.created_at, run.updated_at)}
            </dd>
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <dt className="text-neutral-400 w-28 flex-shrink-0">Audit ID</dt>
            <dd className="font-mono text-xs text-neutral-500 truncate">{run.id}</dd>
          </div>
        </dl>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Metric label="Tools tested" value={results.length} />
          <Metric label="Verified" value={passed} tone="text-emerald-600" />
          <Metric label="Warnings" value={warnings} tone="text-amber-600" />
          <Metric label="Failed" value={failed} tone="text-red-600" />
        </div>

        {/* Per-tool ledger */}
        <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">
          Declared vs. observed
        </h2>
        <div className="rounded-xl border border-neutral-200 overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left">
              <tr className="text-xs text-neutral-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-semibold">Tool</th>
                <th className="px-4 py-2.5 font-semibold">Declared</th>
                <th className="px-4 py-2.5 font-semibold">Observed</th>
                <th className="px-4 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {results.map(r => {
                const isMismatch = r.verdict === 'MISMATCH';
                return (
                  <tr key={r.id} className={isMismatch ? 'bg-red-50/40' : undefined}>
                    <td className="px-4 py-3 font-mono font-medium text-neutral-900">{r.tool_name}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      {r.declared_read_only === true
                        ? 'Read-only'
                        : r.declared_read_only === false
                          ? 'Read / write'
                          : 'Not declared'}
                    </td>
                    <td className={'px-4 py-3 ' + (isMismatch ? 'text-red-700 font-medium' : 'text-neutral-600')}>
                      {/* Derived from the declared/verdict pair: a VERIFIED
                          read-only tool provably changed nothing, and a
                          read-only MISMATCH provably did. */}
                      {r.verdict === 'VERIFIED'
                        ? r.declared_read_only === true
                          ? 'No state change'
                          : 'State changed'
                        : isMismatch
                          ? r.declared_read_only === true
                            ? 'State changed'
                            : 'No state change'
                          : 'Not comparable'}
                    </td>
                    <td className="px-4 py-3">
                      {r.verdict === 'VERIFIED' ? (
                        <span className="text-emerald-700 font-semibold">✓ Match</span>
                      ) : isMismatch ? (
                        <span className="text-red-700 font-semibold">
                          ✗ Mismatch{r.severity ? ` · ${r.severity}` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">? Unverifiable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Why it failed, in plain terms */}
        {mismatches.length > 0 && (
          <div className={`rounded-xl ${style.bg} ring-1 ring-inset ${style.ring} px-5 py-4 mb-8`}>
            <h2 className="text-sm font-bold text-neutral-900 mb-2">Why this server was flagged</h2>
            <ul className="space-y-2 text-sm text-neutral-700">
              {mismatches.map(r => (
                <li key={r.id}>
                  <span className="font-mono font-semibold">{r.tool_name}</span>{' '}
                  {r.declared_read_only === true ? (
                    <>
                      declares <span className="font-mono">readOnlyHint: true</span>, but modified
                      persistent state when it was called. A client that trusts this annotation to
                      decide what is safe to call automatically would be wrong.
                    </>
                  ) : (
                    <>
                      declares <span className="font-mono">readOnlyHint: false</span>, but no state
                      change was observed. This may be an untested write path rather than a defect.
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Basis — this is what makes it a certificate rather than an opinion */}
        <div className="text-xs text-neutral-500 leading-relaxed border-t border-neutral-100 pt-6">
          <p className="mb-1.5">
            <span className="font-semibold text-neutral-700">Basis of this result.</span> Each tool was
            executed inside an isolated sandbox against its own disposable copy of a seeded fixture
            database. State was snapshotted immediately before and after every call, and the verdicts
            above were derived from those diffs by a deterministic function
            (<span className="font-mono">packages/verdict-engine</span>) — not by a language model.
            The model chose which tools to test and with what inputs; it did not decide any verdict.
          </p>
          <p>
            <span className="font-semibold text-neutral-700">Scope.</span> Findings cover only the
            tools listed above, exercised with the inputs recorded in this run&apos;s evidence.
            Attest does not detect a server that behaves differently when it detects it is being
            audited.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'text-neutral-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-4 py-3">
      <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-neutral-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
