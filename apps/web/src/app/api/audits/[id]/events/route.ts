import { getEvents, getRun } from '../../../../../../lib/models';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let lastId = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode("event: connected\ndata: ok\n\n"));

      const interval = setInterval(() => {
        const run = getRun(id);
        if (!run) {
          clearInterval(interval);
          controller.close();
          return;
        }

        const events = getEvents(id, lastId);
        for (const ev of events) {
          controller.enqueue(
            enc.encode("event: audit_event\ndata: " + JSON.stringify(ev) + "\n\n")
          );
          lastId = ev.id;
        }

        // CANCELLED is terminal too -- without it the SSE stream would poll
        // forever against a run that will never change again.
        if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
          controller.enqueue(
            enc.encode("event: audit_complete\ndata: " + JSON.stringify({ status: run.status }) + "\n\n")
          );
          clearInterval(interval);
          controller.close();
        }
      }, 500);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
