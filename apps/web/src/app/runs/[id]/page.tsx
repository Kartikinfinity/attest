'use client';
import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, FileCode, Check, X, ShieldAlert, XCircle } from 'lucide-react';
import { use } from 'react';
import Link from 'next/link';

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [evidenceMap, setEvidenceMap] = useState<any>({});
  const [approvalRequired, setApprovalRequired] = useState<any>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    fetch(`/api/audits/${id}`)
      .then(res => res.json())
      .then(data => {
        setRun(data.run);
        setResults(data.results);
        const eMap: any = {};
        data.evidence.forEach((e: any) => {
          eMap[e.tool_name] = e;
        });
        setEvidenceMap(eMap);
        
        if (data.run?.status === 'AWAITING_APPROVAL') {
          // Find approval event
          fetch(`/api/audits/${id}/events`) // We just need events to find the pending toolCall
            .catch(console.error); // Handled by SSE stream below anyway
        }
      });

    // SSE connection
    const eventSource = new EventSource(`/api/audits/${id}/events`);
    eventSource.addEventListener('audit_event', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [...prev, data]);
      if (data.type === 'tool.approval_required') {
        setRun((prev: any) => ({ ...prev, status: 'AWAITING_APPROVAL' }));
        setApprovalRequired(data);
      }
    });
    eventSource.addEventListener('audit_complete', (e) => {
      const data = JSON.parse(e.data);
      setRun((prev: any) => ({ ...prev, status: data.status }));
      
      // Re-fetch final structured data
      fetch(`/api/audits/${id}`)
        .then(res => res.json())
        .then(data => {
          setRun(data.run);
          setResults(data.results);
          const eMap: any = {};
          data.evidence.forEach((e: any) => {
            eMap[e.tool_name] = e;
          });
          setEvidenceMap(eMap);
        });
        
      eventSource.close();
    });

    return () => eventSource.close();
  }, [id]);

  const handleApproval = async (allow: boolean) => {
    if (!approvalRequired) return;
    const pendingCall = approvalRequired.toolCalls[0];
    await fetch(`/api/audits/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allow,
        threadId: approvalRequired.threadId,
        toolCallId: pendingCall.id
      })
    });
    setApprovalRequired(null);
    setRun((prev: any) => ({ ...prev, status: 'RUNNING' }));
  };

  const renderBadge = (verdict: string, severity?: string) => {
    if (verdict === 'VERIFIED') return <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2 py-1 text-xs font-bold text-green-700 ring-1 ring-green-600/20 ring-inset"><CheckCircle className="h-3.5 w-3.5" /> VERIFIED</span>;
    if (verdict === 'MISMATCH') return <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset"><AlertTriangle className="h-3.5 w-3.5" /> MISMATCH · {severity || 'HIGH'}</span>;
    if (verdict === 'UNVERIFIABLE') return <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-800 ring-1 ring-yellow-600/20 ring-inset">? UNVERIFIABLE</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-500/10 ring-inset"><XCircle className="h-3.5 w-3.5" /> TEST FAILED</span>;
  };

  if (!run) return <div className="p-12 text-center text-gray-500">Loading audit state...</div>;

  const repoName = run.server_dir.split('/').pop();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-900 transition-colors">ATTEST</Link>
            <span className="text-gray-300">/</span>
            <h1 className="font-mono font-semibold">{repoName}</h1>
            {run.status === 'COMPLETED' ? (
              <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-500/10 ring-inset">COMPLETED</span>
            ) : run.status === 'FAILED' ? (
               <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset">FAILED</span>
            ) : (
              <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
                AUDIT IN PROGRESS
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-12 gap-8">
        
        {/* Left Column: Timeline & Tools list */}
        <div className="col-span-12 md:col-span-4 space-y-6">
          <div className="bg-white rounded-xl border p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Investigation Progress</h3>
            <div className="space-y-4">
              {events.filter(e => e.type === 'model.message' && typeof e.data.content === 'string' && e.data.content.includes('[Tool Executed')).map((e, i) => (
                <div key={i} className="flex gap-3 text-sm text-gray-600">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span>Tool executed in sandbox</span>
                </div>
              ))}
              {run.status !== 'COMPLETED' && run.status !== 'FAILED' && (
                <div className="flex gap-3 text-sm text-gray-400 animate-pulse">
                  <Clock className="h-5 w-5 flex-shrink-0" />
                  <span>Observing state changes...</span>
                </div>
              )}
              {run.status === 'COMPLETED' && (
                <div className="flex gap-3 text-sm text-green-700 font-medium pt-2 border-t mt-4">
                  <CheckCircle className="h-5 w-5 flex-shrink-0" />
                  <span>Investigation complete</span>
                </div>
              )}
            </div>
          </div>

          {results.length > 0 && (
            <div className="bg-white rounded-xl border p-0 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-gray-50/50">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Tools Tested</h3>
              </div>
              <div className="divide-y">
                {results.map(r => (
                  <button 
                    key={r.id} 
                    onClick={() => setSelectedTool(r.tool_name)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors flex justify-between items-center ${selectedTool === r.tool_name ? 'bg-blue-50/30' : ''}`}
                  >
                    <span className="font-mono text-sm text-gray-900">{r.tool_name}</span>
                    {renderBadge(r.verdict, r.severity)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Evidence Viewer */}
        <div className="col-span-12 md:col-span-8 space-y-6">
          
          {approvalRequired && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm mb-6">
              <div className="flex items-start gap-4">
                <ShieldAlert className="h-8 w-8 text-blue-600 mt-1" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-blue-900">CERTIFICATION READY</h3>
                  <p className="text-blue-800 mt-1 mb-4">The agent wants to publish this audit result. Please review the findings before publishing.</p>
                  
                  <div className="bg-white rounded-lg border border-blue-100 p-4 mb-5 font-mono text-sm text-gray-800">
                    <span className="text-gray-400 block mb-2">{ '// Action requested' }</span>
                    publish_certification
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => handleApproval(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-medium text-sm transition-colors shadow-sm">
                      Publish Report
                    </button>
                    <button onClick={() => handleApproval(false)} className="bg-white text-blue-900 hover:bg-blue-50 px-5 py-2 rounded-md font-medium text-sm border border-blue-200 transition-colors shadow-sm">
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectedTool && results.length > 0 && (
             <div className="bg-white rounded-xl border p-12 text-center text-gray-500 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
               <FileCode className="h-12 w-12 text-gray-300 mb-4" />
               <p className="text-lg font-medium text-gray-900">Select a tool to view evidence</p>
               <p className="mt-1">Review the declared vs observed behavior for each tested tool.</p>
             </div>
          )}

          {selectedTool && evidenceMap[selectedTool] && (
            <EvidenceViewer toolName={selectedTool} result={results.find(r => r.tool_name === selectedTool)} evidence={evidenceMap[selectedTool]} />
          )}

        </div>

      </main>
    </div>
  );
}

function EvidenceViewer({ toolName, result, evidence }: { toolName: string, result: any, evidence: any }) {
  const isMismatch = result.verdict === 'MISMATCH';
  
  // Calculate raw diff counts
  const diffs = evidence.diff || [];
  const added = diffs.filter((d: any) => d.type === 'table_added' || d.type === 'row_added').length;
  const removed = diffs.filter((d: any) => d.type === 'table_removed' || d.type === 'row_removed').length;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="p-6 border-b flex justify-between items-start bg-gray-50/50">
        <div>
          <h2 className="text-xl font-bold font-mono text-gray-900 mb-2">{toolName}</h2>
          <div className="flex gap-2">
            {result.verdict === 'VERIFIED' ? <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2 py-1 text-xs font-bold text-green-700 ring-1 ring-green-600/20 ring-inset"><CheckCircle className="h-3.5 w-3.5" /> VERIFIED</span> :
             result.verdict === 'MISMATCH' ? <span className="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset"><AlertTriangle className="h-3.5 w-3.5" /> MISMATCH · {result.severity || 'HIGH'}</span> :
             <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-100 px-2 py-1 text-xs font-bold text-yellow-800 ring-1 ring-yellow-600/20 ring-inset">UNVERIFIABLE</span>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 divide-x divide-gray-100">
        <div className="p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">What The Server Claims</h3>
          <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm border">
            <div className="mb-2"><span className="text-gray-500">readOnlyHint:</span> <span className="font-bold text-gray-900">{result.declared_read_only === null ? 'undefined' : String(result.declared_read_only).toUpperCase()}</span></div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            {result.declared_read_only === true ? 'Expected: No state change' : result.declared_read_only === false ? 'Expected: State mutation' : 'No read-only declaration was provided, so Attest cannot compare the claim.'}
          </p>
        </div>
        <div className="p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">What Actually Happened</h3>
          <div className={`bg-gray-50 rounded-lg p-4 font-mono text-sm border ${isMismatch ? 'border-red-200 bg-red-50/30' : ''}`}>
            {diffs.length === 0 ? (
              <span className="text-gray-600">No state changes observed</span>
            ) : (
              <div className="space-y-1">
                <span className="text-gray-900 font-bold block mb-1">State changed</span>
                {added > 0 && <div className="text-red-600">+{added} row/table additions</div>}
                {removed > 0 && <div className="text-red-600">-{removed} row/table removals</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {isMismatch && (
        <div className="p-6 border-t bg-red-50/50">
          <h3 className="text-xs font-semibold text-red-800 uppercase tracking-wider mb-2">Why This Matters</h3>
          <p className="text-sm text-red-900">
            This tool declares itself read-only (`readOnlyHint: true`), but execution produced a persistent state change in the test fixture. An agent using this tool to read data might accidentally mutate production state.
          </p>
        </div>
      )}

      {diffs.length > 0 && (
        <div className="p-6 border-t bg-gray-900 text-gray-300 font-mono text-sm overflow-x-auto">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Observed Diff Evidence</h3>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(diffs, null, 2)}
          </pre>
        </div>
      )}

      <details className="border-t group">
        <summary className="p-6 text-sm font-medium text-blue-600 cursor-pointer hover:bg-gray-50">View Raw Evidence</summary>
        <div className="p-6 pt-0 space-y-6">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Test Input</h4>
            <pre className="bg-gray-50 p-4 rounded-lg border text-xs overflow-x-auto text-gray-800">{JSON.stringify(evidence.test_input, null, 2)}</pre>
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Raw Response</h4>
            <pre className="bg-gray-50 p-4 rounded-lg border text-xs overflow-x-auto text-gray-800">{JSON.stringify(evidence.raw_response, null, 2)}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}
