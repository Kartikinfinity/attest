import { getEvents, getRun } from '../../../../../../lib/models';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let lastId = 0;
  
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode("event: connected\\ndata: ok\\n\\n"));

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
            new TextEncoder().encode(
              "event: audit_event\\ndata: " + JSON.stringify(ev) + "\\n\\n"
            )
          );
          lastId = ev.id;
        }

        if (run.status === 'COMPLETED' || run.status === 'FAILED') {
          controller.enqueue(
            new TextEncoder().encode(
              "event: audit_complete\\ndata: " + JSON.stringify({ status: run.status }) + "\\n\\n"
            )
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
