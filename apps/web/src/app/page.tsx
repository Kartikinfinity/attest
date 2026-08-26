'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Play, History, CheckCircle, AlertTriangle, AlertCircle, XCircle } from 'lucide-react';

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
      router.push(`/runs/${run.id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'CERTIFIED':
        return <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset"><CheckCircle className="h-3.5 w-3.5" /> VERIFIED</span>;
      case 'FLAGGED':
        return <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-600/10 ring-inset"><AlertTriangle className="h-3.5 w-3.5" /> FLAGGED</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset"><History className="h-3.5 w-3.5" /> {verdict || 'PENDING'}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-gray-900" />
            <h1 className="text-xl font-bold tracking-tight">ATTEST</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid md:grid-cols-2 gap-12">
          
          {/* New Audit Form */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-6">New Audit</h2>
            <div className="bg-white rounded-xl border p-6 shadow-sm">
              <p className="text-sm text-gray-500 mb-6">
                Your server will be tested inside an isolated environment using disposable test data.
              </p>
              <form onSubmit={handleStart} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repository URL</label>
                  <input
                    type="url"
                    value={repoUrl}
                    onChange={e => setRepoUrl(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Server Directory</label>
                  <input
                    type="text"
                    value={serverDir}
                    onChange={e => setServerDir(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white py-2.5 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? 'Starting...' : (
                    <>
                      <Play className="h-4 w-4" /> Start Audit
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Recent Audits */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-6">Recent Audits</h2>
            <div className="space-y-3">
              {runs.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-500 shadow-sm">
                  <p>No audits yet.</p>
                  <p className="text-sm mt-1">Submit an MCP server and let Attest test what its tools actually do.</p>
                </div>
              ) : (
                runs.map(run => (
                  <div key={run.id} onClick={() => router.push(`/runs/${run.id}`)} className="bg-white rounded-xl border p-5 shadow-sm hover:border-gray-400 cursor-pointer transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-gray-900 font-mono text-sm">{run.server_dir.split('/').pop()}</h3>
                      {getVerdictBadge(run.overall_verdict || run.status)}
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="text-sm text-gray-500">
                        {new Date(run.created_at).toLocaleString()}
                      </div>
                      <div className="text-sm font-medium text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">
                        View audit →
                      </div>
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
