import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3009;

/**
 * Published certification reports, keyed by runId, so Attest can fetch the
 * exact report the agent submitted. In-memory on purpose: a report is only
 * needed for the few seconds between publication and Attest scoring it, and
 * Attest persists the derived verdicts itself. Restarting this server
 * during an in-flight audit loses the report -- an accepted trade for a
 * demo-scale service with no datastore of its own.
 */
const reports = new Map<string, string>();
let latestReport: string | null = null;

app.post('/mcp', (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  // JSON-RPC NOTIFICATIONS have no `id` and expect no response body.
  //
  // This guard is why this server previously could not be reached at all.
  // The MCP handshake is: initialize -> the client then sends a
  // `notifications/initialized` notification. Without this, that fell
  // through to the "Unsupported method" 400 at the bottom, TrueForge
  // treated the connection as dead, and publish_certification became
  // unreachable -- so a fully successful audit (all evidence gathered)
  // still died at the final step with:
  //   Failed to connect to remote MCP server 'attest-internal' ...
  //   {"error":"Unsupported method"}
  // demo-servers/invoice-server has always had this guard; this server
  // was simply missing it.
  if (id === undefined || id === null) {
    return res.status(202).end();
  }

  // Liveness check some MCP clients issue after connecting.
  if (method === 'ping') {
    return res.json({ jsonrpc: '2.0', id, result: {} });
  }

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: {
          name: 'attest-internal',
          version: '0.1.0'
        }
      }
    });
  }

  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'publish_certification',
            description: 'Publish the final certification report after testing is complete.',
            inputSchema: {
              type: 'object',
              properties: {
                report: {
                  type: 'string',
                  description: 'The JSON stringified CertificationReport'
                }
              },
              required: ['report']
            },
            annotations: {
              // We explicitely gate this in TrueForge via require_approval_for_tools
              // But we can also set destructiveHint here for good measure
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: true
            }
          }
        ]
      }
    });
  }

  if (method === 'tools/call') {
    if (params.name === 'publish_certification') {
      const { report } = params.arguments;
      console.log(`[attest-internal] Certification published:`, report);

      // Hand the report back to Attest.
      //
      // Attest cannot recover it from its own event log: TrueForge's
      // `tool.approval_required` event carries only {id, sourceEventId}
      // per tool call -- no name, no arguments -- and the arguments
      // themselves only ever arrive as streamed `model.message.delta`
      // fragments that would have to be reassembled. This server, by
      // contrast, receives the finished report as a single string.
      //
      // Keyed by the runId the agent is instructed to embed in the
      // report, so concurrent audits don't collide. `latest` is a
      // fallback for the case where the agent omits it -- correct for a
      // single active audit, and better than losing the report entirely.
      try {
        const parsed = JSON.parse(report);
        if (parsed && typeof parsed.runId === 'string') {
          reports.set(parsed.runId, report);
        }
      } catch {
        // A report that isn't valid JSON still reaches `latest`; Attest
        // will surface the parse failure rather than this server guessing.
      }
      latestReport = report;

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: 'Certification published successfully.' }
          ]
        }
      });
    }

    // JSON-RPC transports errors in the body, not the HTTP status -- a
    // non-2xx here reads as a transport failure to the client rather than
    // "that tool doesn't exist".
    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool not found: ${params.name}` }
    });
  }

  // Unknown method: a well-formed JSON-RPC error, HTTP 200. Previously this
  // returned HTTP 400 with a bare {error: string} that wasn't valid
  // JSON-RPC at all, which is what the MCP client surfaced verbatim as
  // "Error POSTing to endpoint: {"error":"Unsupported method"}".
  return res.json({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

// Streamable HTTP clients may probe GET /mcp to open a server-push SSE
// stream. This server doesn't offer one (every response is a direct reply
// to a POST), so say so explicitly: 405 means "wrong method for this
// endpoint", whereas the previous bare 404 implied the endpoint itself
// was missing and made the failure look like a misconfigured URL.
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32601, message: 'This server does not provide an SSE stream; POST to /mcp instead.' }
  });
});

/**
 * Attest fetches the published report here after the human approves.
 * Falls back to the most recent report when the agent omitted runId.
 */
app.get('/report/:runId', (req, res) => {
  const exact = reports.get(req.params.runId);
  if (exact) return res.json({ found: true, source: 'runId', report: exact });
  if (latestReport) return res.json({ found: true, source: 'latest', report: latestReport });
  res.status(404).json({ found: false, error: 'No certification report has been published yet.' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'attest-internal', tools: ['publish_certification'] });
});

app.listen(PORT, () => {
  console.log(`attest-internal server running on http://localhost:${PORT}`);
});
