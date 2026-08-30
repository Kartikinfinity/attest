'use client';
import { Check, X, Circle } from 'lucide-react';

type MilestoneState = 'done' | 'active' | 'pending' | 'failed';

interface Milestone {
  label: string;
  reached: boolean;
  detail?: string;
}

/**
 * Progress steps derived ONLY from real, verifiable signals in the event
 * log (sandbox.created / tool.response / tool.approval_required presence
 * and counts) -- deliberately not a fake percentage bar, and deliberately
 * not claiming named phases ("tools discovered", "MCP server started")
 * that the raw TrueForge event stream doesn't actually distinguish. See
 * apps/web/src/lib/status.ts for the shared status semantics used
 * elsewhere on this page.
 */
export function AuditProgress({
  status,
  events,
}: {
  status: 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED';
  events: Array<{ type: string }>;
}) {
  const hasSandbox = events.some(e => e.type === 'sandbox.created');
  const toolCallCount = events.filter(e => e.type === 'tool.response').length;
  const hasApprovalRequest = events.some(e => e.type === 'tool.approval_required');

  const isFailed = status === 'FAILED';
  const isRunning = status === 'RUNNING' || status === 'PENDING';
  const isAwaiting = status === 'AWAITING_APPROVAL';

  // The final milestone must not claim to be waiting on the human unless it
  // genuinely is. Labelling it "Awaiting your review" while the agent is
  // still working reads as "there is a button for me somewhere" when there
  // is nothing to approve yet -- actively misleading, and it was.
  const certificationLabel = hasApprovalRequest
    ? isAwaiting
      ? 'Awaiting your review'
      : 'Certification reviewed'
    : 'Certification ready for review';

  const milestones: Milestone[] = [
    { label: 'Audit started', reached: true },
    { label: 'Sandbox initialized', reached: hasSandbox },
    {
      label: 'Executing audit in sandbox',
      reached: toolCallCount > 0,
      detail: toolCallCount > 0 ? `${toolCallCount} command${toolCallCount === 1 ? '' : 's'} executed so far` : undefined,
    },
    {
      label: certificationLabel,
      reached: hasApprovalRequest,
    },
  ];

  const firstNotReached = milestones.findIndex(m => !m.reached);

  return (
    <ol className="space-y-4">
      {milestones.map((m, i) => {
        let state: MilestoneState;
        if (m.reached) state = 'done';
        else if (i === firstNotReached && isFailed) state = 'failed';
        else if (i === firstNotReached && (isRunning || isAwaiting)) state = 'active';
        else state = 'pending';

        return (
          <li key={m.label} className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0">
              {state === 'done' && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-3 w-3 text-emerald-700" strokeWidth={3} />
                </span>
              )}
              {state === 'failed' && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100">
                  <X className="h-3 w-3 text-red-700" strokeWidth={3} />
                </span>
              )}
              {state === 'active' && (
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                </span>
              )}
              {state === 'pending' && (
                <span className="flex h-5 w-5 items-center justify-center">
                  <Circle className="h-3.5 w-3.5 text-neutral-300" />
                </span>
              )}
            </span>
            <div className="min-w-0">
              <p
                className={
                  'text-sm font-medium ' +
                  (state === 'done'
                    ? 'text-neutral-900'
                    : state === 'failed'
                      ? 'text-red-700'
                      : state === 'active'
                        ? 'text-accent'
                        : 'text-neutral-400')
                }
              >
                {m.label}
              </p>
              {m.detail && <p className="text-xs text-neutral-500 mt-0.5">{m.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
