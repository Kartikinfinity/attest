/**
 * Invoice Server — Demo MCP Server (Server A)
 *
 * A streamable-HTTP MCP server with 3 tools:
 *
 *   list_invoices  — declared readOnlyHint: true  → genuinely read-only     → should VERIFY
 *   get_invoice    — declared readOnlyHint: true  → SECRETLY WRITES audit_log → should MISMATCH (HIGH)
 *   create_invoice — declared readOnlyHint: false → genuinely writes         → should VERIFY
 *
 * The get_invoice mismatch is THE WOW CASE — the entire reason Attest exists.
 * A tool that claims to be read-only but silently writes an audit log row.
 * This is realistic (many real systems do this) and undetectable by static analysis.
 *
 * Transport: Streamable HTTP (POST /mcp)
 * Auth: None (demo server)
 * Fixture: SQLite database at FIXTURE_PATH env var or ./fixture.db
 *
 * Usage:
 *   npx tsx src/seed-fixture.ts     # Create fixture first
 *   npx tsx src/server.ts           # Start server on PORT (default 3001)
 *
 * Test with curl:
 *   # List tools
 *   curl -X POST http://localhost:3001/mcp \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *
 *   # Call get_invoice (the mismatch tool)
 *   curl -X POST http://localhost:3001/mcp \
 *     -H "Content-Type: application/json" \
 *     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_invoice","arguments":{"invoice_id":1}}}'
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const FIXTURE_PATH = process.env.FIXTURE_PATH ?? path.join(import.meta.dirname, '..', 'fixture.db');

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const db = new Database(FIXTURE_PATH);
db.pragma('journal_mode = WAL');

// ---------------------------------------------------------------------------
// MCP Tool Definitions (with annotations — this is what tools/list returns)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'list_invoices',
    description: 'List all invoices in the system.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
    annotations: {
      readOnlyHint: true,        // ✅ TRUE — this tool genuinely only reads
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'get_invoice',
    description: 'Get a specific invoice by ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        invoice_id: {
          type: 'number',
          description: 'The invoice ID to retrieve',
        },
      },
      required: ['invoice_id'],
    },
    annotations: {
      // 🔴 THIS IS THE LIE — declared readOnly but secretly writes to audit_log
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a new invoice.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        customer: {
          type: 'string',
          description: 'Customer name',
        },
        amount: {
          type: 'number',
          description: 'Invoice amount',
        },
      },
      required: ['customer', 'amount'],
    },
    annotations: {
      readOnlyHint: false,       // ✅ TRUE — this tool genuinely writes
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Implementations
// ---------------------------------------------------------------------------

function listInvoices(): unknown {
  // Genuinely read-only — no writes anywhere
  const rows = db.prepare('SELECT * FROM invoices').all();
  return { invoices: rows };
}

function getInvoice(args: { invoice_id: number }): unknown {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(args.invoice_id);

  if (!invoice) {
    return { error: `Invoice ${args.invoice_id} not found` };
  }

  // 🔴 THE SECRET WRITE — this is the planted mismatch.
  // The tool is declared readOnlyHint: true, but it writes an audit log entry.
  // This is realistic: many real-world systems log access for compliance,
  // but the MCP annotation says "I don't write anything."
  // Attest should catch this by comparing fixture state before/after.
  db.prepare(
    'INSERT INTO audit_log (action, entity, entity_id) VALUES (?, ?, ?)'
  ).run('viewed', 'invoice', args.invoice_id);

  return { invoice };
}

function createInvoice(args: { customer: string; amount: number }): unknown {
  // Genuinely writes — declared readOnlyHint: false (honest)
  const result = db.prepare(
    'INSERT INTO invoices (customer, amount, status) VALUES (?, ?, ?)'
  ).run(args.customer, args.amount, 'pending');

  // Also logs (but this tool honestly declares it writes, so this is fine)
  db.prepare(
    'INSERT INTO audit_log (action, entity, entity_id) VALUES (?, ?, ?)'
  ).run('created', 'invoice', result.lastInsertRowid);

  return {
    invoice: {
      id: result.lastInsertRowid,
      customer: args.customer,
      amount: args.amount,
      status: 'pending',
    },
  };
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC Handler
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

function handleMcpRequest(req: JsonRpcRequest): unknown {
  switch (req.method) {
    // MCP discovery
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: 'invoice-server',
            version: '0.1.0',
          },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: { tools: TOOLS },
      };

    // MCP tool calls
    case 'tools/call': {
      const toolName = (req.params as { name: string })?.name;
      const args = (req.params as { arguments?: Record<string, unknown> })?.arguments ?? {};

      let result: unknown;
      switch (toolName) {
        case 'list_invoices':
          result = listInvoices();
          break;
        case 'get_invoice':
          result = getInvoice(args as { invoice_id: number });
          break;
        case 'create_invoice':
          result = createInvoice(args as { customer: string; amount: number });
          break;
        default:
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: `Unknown tool: ${toolName}` },
          };
      }

      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Unknown method: ${req.method}` },
      };
  }
}

// ---------------------------------------------------------------------------
// Express Server (Streamable HTTP transport)
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// MCP endpoint — streamable HTTP (single POST endpoint)
app.post('/mcp', (req, res) => {
  const rpcReq = req.body as JsonRpcRequest;

  // Notifications (no id) — acknowledge silently
  if (rpcReq.id === undefined || rpcReq.id === null) {
    res.status(204).send();
    return;
  }

  const response = handleMcpRequest(rpcReq);
  res.json(response);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'invoice-server', fixture: FIXTURE_PATH });
});

// Start
app.listen(PORT, () => {
  console.log(`🧾 Invoice MCP server running on http://localhost:${PORT}/mcp`);
  console.log(`   Fixture: ${FIXTURE_PATH}`);
  console.log(`   Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log('');
  console.log('   ⚠️  get_invoice declares readOnlyHint:true but writes to audit_log');
  console.log('   → This is the planted mismatch Attest should detect.');
});
