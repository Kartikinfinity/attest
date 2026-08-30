'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, History, ShieldCheck, FileSearch, GitBranch, Loader2 } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { getRunDisplayStatus, formatDuration, formatTimestamp } from '../lib/status';

interface RunSummary {
  id: string;
  repo_url: string;
  server_dir: string;
  status: 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  overall_verdict: string | null;
  created_at: string;
  updated_at: string;
  tools_tested: number;
  tools_verified: number;
  tools_failed: number;
  tools_warning: number;
}

const AUDIT_CHECKS = [
  { icon: ShieldCheck, label: 'Tool annotations vs. observed behavior' },
  { icon: FileSearch, label: 'Read / write state changes' },
  { icon: GitBranch, label: 'Destructive action detection' },
  { icon: ShieldCheck, label: 'Isolated, disposable sandbox execution' },
];

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/Kartikinfinity/attest.git');
  const [serverDir, setServerDir] = useState('demo-servers/invoice-server');
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/audits')
      .then(res => res.json())
      .then(data => setRuns(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoadingRuns(false));
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, serverDir }),
      });
      if (!res.ok) throw new Error(`Failed to start audit (${res.status})`);
      const run = await res.json();
      router.push('/runs/' + run.id);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-neutral-900">
      <AppHeader />

      <main>
        <div className="bg-dot-grid border-b border-[var(--border-subtle)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-14">
            <p className="text-xs font-bold tracking-[0.2em] text-accent uppercase mb-3">MCP Behavioral Certification</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 mb-4 max-w-2xl">
              Prove what your tools actually do.
            </h2>
            <p className="text-neutral-600 text-base sm:text-lg leading-relaxed max-w-2xl">
              Attest runs your MCP server&apos;s tools inside an isolated sandbox and checks whether what they actually
              do matches what they declare — <span className="text-neutral-900 font-semibold">readOnlyHint</span>,{' '}
              <span className="text-neutral-900 font-semibold">destructiveHint</span>, and the rest — backed by observed
              state changes, never by reading source code or trusting a model&apos;s judgment.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid lg:grid-cols-12 gap-6 lg:gap-10">
          {/* New Audit form */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Start New Audit</h3>
              <p className="text-sm text-neutral-500 mb-6">Deploys an auditor agent into a sandboxed environment.</p>

              <form onSubmit={handleStart} className="space-y-5">
                <div>
                  <label htmlFor="repoUrl" className="block text-sm font-semibold text-neutral-900 mb-2">
                    Repository
                  </label>
                  <input
                    id="repoUrl"
                    type="url"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-accent focus:border-accent focus:outline-none transition-all placeholder:text-neutral-400"
                    placeholder="https://github.com/..."
                    required
                  />
                </div>
                <div>
                  <label htmlFor="serverDir" className="block text-sm font-semibold text-neutral-900 mb-2">
                    Server directory
                  </label>
                  <input
                    id="serverDir"
                    type="text"
                    value={serverDir}
                    onChange={e => setServerDir(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-accent focus:border-accent focus:outline-none transition-all placeholder:text-neutral-400"
                    placeholder="e.g. packages/my-server"
                    required
                  />
                </div>

                <div className="rounded-xl bg-surface-2 border border-[var(--border-subtle)] p-4">
                  <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">What Attest will verify</p>
                  <ul className="space-y-2.5">
                    {AUDIT_CHECKS.map(check => (
                      <li key={check.label} className="flex items-center gap-2.5 text-sm text-neutral-700">
                        <span className="bg-accent-soft p-1 rounded-md flex-shrink-0">
                          <check.icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                        </span>
                        {check.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white py-3 rounded-lg font-semibold text-sm transition-all shadow-sm active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Deploying agent...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-white" /> Initiate Audit
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Recent Executions */}
          <div className="lg:col-span-7">
            <h3 className="text-lg font-semibold tracking-tight mb-6">Recent Executions</h3>

            {loadingRuns ? (
              <div className="space-y-4" aria-hidden="true">
                {[0, 1].map(i => (
                  <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 animate-pulse">
                    <div className="h-4 w-40 bg-neutral-200 rounded mb-3" />
                    <div className="h-3 w-64 bg-neutral-100 rounded" />
                  </div>
                ))}
              </div>
            ) : runs.length === 0 ? (
              <EmptyState
                icon={History}
                title="No audits yet"
                description="Run your first behavioral audit to verify that your MCP server's declared behavior matches what it actually does."
              />
            ) : (
              <div className="space-y-3">
                {runs.map(run => {
                  const display = getRunDisplayStatus(run);
                  const isTerminal = run.status === 'COMPLETED' || run.status === 'FAILED';
                  const hasToolSummary = run.tools_tested > 0;

                  return (
                    <button
                      key={run.id}
                      onClick={() => router.push('/runs/' + run.id)}
                      className="w-full text-left bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md hover:border-accent/40 transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                          <h4 className="font-semibold text-neutral-900 font-mono text-sm truncate">
                            {run.server_dir.split('/').pop()}
                          </h4>
                          <StatusBadge status={display} size="sm" />
                        </div>
                        <div className="text-neutral-500 text-xs flex items-center gap-2 flex-wrap">
                          {hasToolSummary && (
                            <>
                              <span>
                                {run.tools_tested} tool{run.tools_tested === 1 ? '' : 's'}
                                {run.tools_verified > 0 && ` · ${run.tools_verified} passed`}
                                {run.tools_warning > 0 && ` · ${run.tools_warning} warning${run.tools_warning === 1 ? '' : 's'}`}
                                {run.tools_failed > 0 && ` · ${run.tools_failed} failed`}
                              </span>
                              <span className="text-neutral-300">&bull;</span>
                            </>
                          )}
                          {isTerminal && (
                            <>
                              <span>{formatDuration(run.created_at, run.updated_at)}</span>
                              <span className="text-neutral-300">&bull;</span>
                            </>
                          )}
                          <span>{formatTimestamp(run.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
                        View Report <span className="text-lg leading-none" aria-hidden="true">&rarr;</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
