import { NextResponse } from 'next/server';
import { getRun, updateRun } from '../../../../../../lib/models';
import { handleApproval } from '../../../../../../lib/engine';
import { TrueForge } from '@truefoundry/trueforge-sdk';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { allow, threadId, toolCallId } = await req.json();

  const run = getRun(id);
  if (!run || !run.session_id) {
    return NextResponse.json({ error: 'Run or session not found' }, { status: 404 });
  }

  try {
    const baseUrl = process.env.TRUEFORGE_BASE_URL ?? 'http://localhost:8790';
    const client = new TrueForge({ baseUrl });

    // The backend calls handleApproval to resume the stream!
    // But wait: runAuditSession's stream loop ended when it saw approval_required!
    // TrueForge continues execution in the background, or we need to consume the next stream?
    // If we just submit handleApproval, TrueForge records the approval.
    // The next events won't be streamed into our SQLite DB unless we consume the stream!
    
    const nextStream = await handleApproval(client, run.session_id, {
      threadId,
      toolCallId
    }, { allow, reason: allow ? undefined : 'User denied' });

    updateRun(id, { status: 'RUNNING' });

    // We must lazily consume the rest of the stream to get the turn.done
    // (This is a simplified design: the API route kicks off a dangling promise to finish it)
    import('../../../../../../lib/engine').then(({ runAuditSession }) => {
      // Actually we don't call runAuditSession again, we just consume the stream
      const { addEvent, getRun, updateRun } = require('../../../../../../lib/models');
      
      async function consumeStream(currentStream: any) {
        for await (const { data: event } of currentStream.withMetadata()) {
          addEvent(id, event.type, event);
        }
        const r = getRun(id);
        if (r?.status === 'RUNNING') {
          updateRun(id, { status: 'COMPLETED' });
        }
      }
      
      consumeStream(nextStream).catch(console.error);
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Approval error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
