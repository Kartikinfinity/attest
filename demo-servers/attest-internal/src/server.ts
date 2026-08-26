import express from 'express';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3009;

app.post('/mcp', (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

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

    return res.status(404).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool not found: ${params.name}` }
    });
  }

  return res.status(400).json({ error: 'Unsupported method' });
});

app.listen(PORT, () => {
  console.log(`attest-internal server running on http://localhost:${PORT}`);
});
