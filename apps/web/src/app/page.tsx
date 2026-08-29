'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Play, History, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function Home() {
  const [repoUrl, setRepoUrl] = useState('https://github.com/Kartikinfinity/attest.git');
  const [serverDir, setServerDir] = useState('demo-servers/invoice-server');
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/audits')
      .then(res => res.json())
      .then(data => setRuns(data))
      .catch(console.error);
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
      const run = await res.json();
      router.push('/runs/' + run.id);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'CERTIFIED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset"><CheckCircle className="h-3.5 w-3.5" /> VERIFIED</span>;
      case 'FLAGGED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset"><AlertTriangle className="h-3.5 w-3.5" /> FLAGGED</span>;
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20 ring-inset">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            RUNNING
          </span>
        );
      case 'FAILED':
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset"><XCircle className="h-3.5 w-3.5" /> FAILED</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600 ring-1 ring-neutral-500/10 ring-inset"><History className="h-3.5 w-3.5" /> {verdict || 'PENDING'}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-neutral-900 p-1.5 rounded-md">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-neutral-900">ATTEST</h1>
          </div>
          <div className="flex items-center gap-5 text-sm font-medium text-neutral-500">
            <a href="https://github.com/Kartikinfinity/attest" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-900 transition-colors">Docs</a>
            <span className="text-neutral-300">|</span>
            <span className="text-neutral-400 text-xs">Powered by TrueForge</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Hero */}
        <div className="mb-14">
          <h2 className="text-3xl font-extrabold tracking-tight text-neutral-900 mb-3">Audit Workspace</h2>
          <p className="text-neutral-500 text-lg max-w-2xl leading-relaxed">Submit MCP servers for behavioral certification. Attest executes every tool inside an isolated sandbox and verifies declared behavior against observed state changes.</p>
        </div>

        <div className="grid lg:grid-cols-12 gap-10">
          {/* New Audit Form */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-neutral-200 p-8 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.08)]">
              <h3 className="text-lg font-semibold tracking-tight mb-1">Start New Audit</h3>
              <p className="text-sm text-neutral-500 mb-8">Deploys an auditor agent into a sandboxed environment.</p>
              <form onSubmit={handleStart} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-2">GitHub Repository URL</label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 focus:outline-none transition-all placeholder:text-neutral-400"
                    placeholder="https://github.com/..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neutral-900 mb-2">Server Directory</label>
                  <input
                    type="text"
                    value={serverDir}
                    onChange={e => setServerDir(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 p-2.5 text-sm focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 focus:outline-none transition-all placeholder:text-neutral-400"
                    placeholder="e.g. packages/my-server"
                    required
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white py-3 rounded-lg font-semibold text-sm transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Deploying Agent...
                      </div>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-white" /> Initiate Audit
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Recent Audits */}
          <div className="lg:col-span-7">
            <h3 className="text-lg font-semibold tracking-tight mb-6">Recent Executions</h3>
            <div className="space-y-4">
              {runs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500 flex flex-col items-center justify-center min-h-[300px]">
                  <div className="bg-neutral-100 p-3 rounded-full mb-4">
                    <History className="h-6 w-6 text-neutral-400" />
                  </div>
                  <h4 className="text-neutral-900 font-medium mb-1">No audits recorded</h4>
                  <p className="text-sm max-w-sm">Submit an MCP server to begin your first sandboxed behavioral test.</p>
                </div>
              ) : (
                runs.map(run => (
                  <div
                    key={run.id}
                    onClick={() => router.push('/runs/' + run.id)}
                    className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm hover:shadow-md hover:border-neutral-300 cursor-pointer transition-all group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <h4 className="font-semibold text-neutral-900 font-mono text-sm">{run.server_dir.split('/').pop()}</h4>
                        {getVerdictBadge(run.overall_verdict || run.status)}
                      </div>
                      <div className="text-neutral-500 font-mono text-xs flex items-center gap-2">
                        <span>{run.id}</span>
                        <span className="text-neutral-300">•</span>
                        <span>{new Date(run.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      View Report <span className="text-lg leading-none">&rarr;</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
