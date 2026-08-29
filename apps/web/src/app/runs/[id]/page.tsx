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
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRun(data.run);
        setResults(data.results);
        const eMap: any = {};
        if (data.evidence) {
          data.evidence.forEach((e: any) => {
            eMap[e.tool_name] = e;
          });
        }
        setEvidenceMap(eMap);
        
        if (data.run?.status === 'AWAITING_APPROVAL') {
          // Find approval event
          fetch(`/api/audits/${id}/events`) // We just need events to find the pending toolCall
            .catch(console.error); // Handled by SSE stream below anyway
        }
      })
      .catch(err => {
        console.error("Failed to fetch audit data:", err);
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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-blue-100">
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-neutral-500 hover:text-neutral-900 font-medium transition-colors flex items-center gap-2">
              <Shield className="h-5 w-5" /> ATTEST
            </Link>
            <span className="text-neutral-300">/</span>
            <h1 className="font-mono font-semibold text-neutral-900">{repoName}</h1>
            {run.status === 'COMPLETED' ? (
              <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600 ring-1 ring-neutral-500/10 ring-inset">COMPLETED</span>
            ) : run.status === 'FAILED' ? (
               <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset">FAILED</span>
            ) : (
              <span className="ml-4 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
                AUDIT IN PROGRESS
              </span>
            )}
            {/* overall_verdict is only set after a human Allow/Deny decision
                (see engine.ts's finalizeCertification) -- shown here so a
                Deny visibly differs from a published CERTIFIED/FLAGGED report */}
            {run.overall_verdict === 'CERTIFIED' && (
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">CERTIFIED</span>
            )}
            {run.overall_verdict === 'FLAGGED' && (
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset">FLAGGED</span>
            )}
            {run.overall_verdict === 'DENIED' && (
              <span className="ml-2 inline-flex items-center gap-1.5 rounded-md bg-neutral-200 px-2.5 py-1 text-xs font-bold text-neutral-700 ring-1 ring-neutral-500/20 ring-inset">PUBLISH DENIED</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 grid grid-cols-12 gap-8">
        
        {/* Left Column: Timeline & Tools list */}
        <div className="col-span-12 md:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm">
            <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-5">Investigation Progress</h3>
            <div className="space-y-4">
              {events.filter(e => e.type === 'error').map((e, i) => (
                <div key={'err'+i} className="flex gap-3 text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
                  <XCircle className="h-5 w-5 flex-shrink-0" />
                  <span className="font-medium">Execution failed: {e.data.message || 'Connection refused'}</span>
                </div>
              ))}
              {events.filter(e => e.type === 'model.message' && typeof e.data.content === 'string' && e.data.content.includes('[Tool Executed')).map((e, i) => (
                <div key={i} className="flex gap-3 text-sm text-neutral-700">
                  <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <span>Tool executed in sandbox</span>
                </div>
              ))}
              {run.status !== 'COMPLETED' && run.status !== 'FAILED' && (
                <div className="flex gap-3 text-sm text-neutral-500 animate-pulse">
                  <Clock className="h-5 w-5 flex-shrink-0" />
                  <span>Observing state changes...</span>
                </div>
              )}
              {run.status === 'COMPLETED' && (
                <div className="flex gap-3 text-sm text-neutral-900 font-medium pt-3 border-t mt-5">
                  <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <span>Investigation complete</span>
                </div>
              )}
            </div>
          </div>

          {results.length > 0 && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-0 shadow-sm overflow-hidden">
              <div className="p-5 border-b bg-neutral-50/50">
                <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Tools Tested</h3>
              </div>
              <div className="divide-y divide-neutral-100">
                {results.map(r => (
                  <button 
                    key={r.id} 
                    onClick={() => setSelectedTool(r.tool_name)}
                    className={'w-full text-left p-5 hover:bg-neutral-50 transition-colors flex justify-between items-center ' + (selectedTool === r.tool_name ? 'bg-blue-50/40 hover:bg-blue-50/60' : '')}
                  >
                    <span className="font-mono text-sm font-medium text-neutral-900">{r.tool_name}</span>
                    {renderBadge(r.verdict, r.severity)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Evidence Viewer */}
        <div className="col-span-12 md:col-span-8 space-y-6">
          
          {run.status === 'FAILED' && results.length === 0 && (
            <div className="bg-white rounded-2xl border border-red-200 p-12 text-center text-red-700 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
              <XCircle className="h-12 w-12 text-red-300 mb-4" />
              <h2 className="text-xl font-bold mb-2">Audit Failed to Start</h2>
              <p className="max-w-md text-red-600/80">The TrueForge execution engine encountered an error or was unreachable. Ensure TrueForge is running locally.</p>
            </div>
          )}

          {approvalRequired && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-8 shadow-sm mb-6">
              <div className="flex items-start gap-5">
                <ShieldAlert className="h-10 w-10 text-blue-600 mt-1" />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-blue-950 mb-2">CERTIFICATION READY</h3>
                  <p className="text-blue-800/80 mb-6 font-medium">The agent wants to publish this audit result. Please review the findings before publishing.</p>
                  
                  <div className="bg-white rounded-xl border border-blue-100 p-5 mb-6 font-mono text-sm text-neutral-800 shadow-sm">
                    <span className="text-neutral-400 block mb-2">{ '// Action requested' }</span>
                    publish_certification
                  </div>

                  <div className="flex gap-4">
                    <button onClick={() => handleApproval(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm active:scale-95">
                      Publish Report
                    </button>
                    <button onClick={() => handleApproval(false)} className="bg-white text-blue-900 hover:bg-blue-50 px-6 py-2.5 rounded-lg font-semibold text-sm border border-blue-200 transition-all shadow-sm active:scale-95">
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectedTool && results.length > 0 && (
             <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center text-neutral-500 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
               <FileCode className="h-14 w-14 text-neutral-200 mb-5" />
               <p className="text-xl font-semibold text-neutral-900 mb-2">Select a tool to view evidence</p>
               <p className="max-w-sm text-sm">Review the declared vs observed behavior for each tested tool to verify safety.</p>
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
  
  // sandbox-scripts/test-tool.ts's Evidence.diff entries use `change`
  // (one of added/removed/modified/table_added/table_removed), not `type` --
  // the previous field/value names here never matched real evidence, so
  // this always rendered as "no changes" regardless of what happened.
  const diffs = evidence.diff || [];
  const added = diffs.filter((d: any) => d.change === 'added' || d.change === 'table_added').length;
  const removed = diffs.filter((d: any) => d.change === 'removed' || d.change === 'table_removed').length;
  const modified = diffs.filter((d: any) => d.change === 'modified').length;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-neutral-100 flex justify-between items-start bg-neutral-50/60">
        <div>
          <h2 className="text-xl font-bold font-mono text-neutral-900 mb-3">{toolName}</h2>
          <div className="flex gap-2">
            {result.verdict === 'VERIFIED' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset"><CheckCircle className="h-3.5 w-3.5" /> VERIFIED</span> :
             result.verdict === 'MISMATCH' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-600/10 ring-inset"><AlertTriangle className="h-3.5 w-3.5" /> MISMATCH · {result.severity || 'HIGH'}</span> :
             <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-600/20 ring-inset">UNVERIFIABLE</span>}
          </div>
        </div>
      </div>

      {/* Declared vs Observed */}
      <div className="grid md:grid-cols-2 divide-x divide-neutral-100">
        <div className="px-8 py-6">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Declared Behavior</h3>
          <div className="bg-neutral-50 rounded-xl p-5 font-mono text-sm border border-neutral-200">
            <div><span className="text-neutral-400">readOnlyHint:</span> <span className="font-bold text-neutral-900">{result.declared_read_only === null ? 'undefined' : String(result.declared_read_only).toUpperCase()}</span></div>
          </div>
          <p className="mt-4 text-sm text-neutral-500 leading-relaxed">
            {result.declared_read_only === true ? 'The server declares this tool will NOT modify any state.' : result.declared_read_only === false ? 'The server declares this tool MAY modify state.' : 'No read-only declaration was provided. Attest cannot compare claimed vs observed behavior.'}
          </p>
        </div>
        <div className="px-8 py-6">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Observed Behavior</h3>
          <div className={'bg-neutral-50 rounded-xl p-5 font-mono text-sm border ' + (isMismatch ? 'border-red-300 bg-red-50/40' : 'border-neutral-200')}>
            {diffs.length === 0 ? (
              <span className="text-neutral-500">No state changes observed</span>
            ) : (
              <div className="space-y-1.5">
                <span className="text-neutral-900 font-bold block mb-2">State was mutated</span>
                {added > 0 && <div className="text-emerald-700 font-medium">+ {added} row/table addition{added > 1 ? 's' : ''}</div>}
                {removed > 0 && <div className="text-red-700 font-medium">− {removed} row/table removal{removed > 1 ? 's' : ''}</div>}
                {modified > 0 && <div className="text-amber-700 font-medium">~ {modified} row/table modification{modified > 1 ? 's' : ''}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mismatch Explainer */}
      {isMismatch && (
        <div className="px-8 py-5 border-t border-red-200 bg-red-50/60">
          <h3 className="text-xs font-bold text-red-800 uppercase tracking-widest mb-2">Impact</h3>
          <p className="text-sm text-red-900/80 leading-relaxed">
            This tool declares itself read-only, but execution produced a persistent state change. An AI agent trusting this declaration could unintentionally mutate production data.
          </p>
        </div>
      )}

      {/* Diff Evidence */}
      {diffs.length > 0 && (
        <div className="px-8 py-6 border-t border-neutral-200 bg-neutral-950 text-neutral-300 font-mono text-sm overflow-x-auto">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Observed Diff</h3>
          <pre className="whitespace-pre-wrap leading-relaxed text-neutral-400">
            {JSON.stringify(diffs, null, 2)}
          </pre>
        </div>
      )}

      {/* Raw Evidence */}
      <details className="border-t border-neutral-200 group">
        <summary className="px-8 py-5 text-sm font-semibold text-blue-600 cursor-pointer hover:bg-neutral-50 transition-colors select-none">View Raw Evidence</summary>
        <div className="px-8 pb-8 space-y-6">
          <div>
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Test Input</h4>
            <pre className="bg-neutral-50 p-5 rounded-xl border border-neutral-200 text-xs overflow-x-auto text-neutral-700 leading-relaxed">{JSON.stringify(evidence.test_input, null, 2)}</pre>
          </div>
          <div>
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-3">Raw Response</h4>
            <pre className="bg-neutral-50 p-5 rounded-xl border border-neutral-200 text-xs overflow-x-auto text-neutral-700 leading-relaxed">{JSON.stringify(evidence.raw_response, null, 2)}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}
