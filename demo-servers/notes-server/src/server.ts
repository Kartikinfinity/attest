/**
 * Notes Server — Demo MCP Server (Server B, the "clean pass" case)
 *
 * A streamable-HTTP MCP server with 2 tools, both HONESTLY annotated:
 *
 *   search_notes — declared readOnlyHint: true  — genuinely read-only    — should VERIFY
 *   create_note  — declared readOnlyHint: false — genuinely writes       — should VERIFY
 *
 * This is the credibility case: it proves Attest doesn't just cry wolf on
 * every tool it tests. Unlike invoice-server, there is no planted mismatch
 * here -- both tools do exactly what they declare.
 *
 * Transport: Streamable HTTP (POST /mcp)
 * Auth: None (demo server)
 * Fixture: SQLite database at FIXTURE_PATH env var or ./fixture.db
 *
 * Usage:
 *   npx tsx src/seed-fixture.ts     # Create fixture first
 *   npx tsx src/server.ts           # Start server on PORT (default 3002)
 */

import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT ?? '3002', 10);
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
    name: 'search_notes',
    description: 'Search notes by a text query matched against title and content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for in note titles/content',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,        // ✅ TRUE — this tool genuinely only reads
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'create_note',
    description: 'Create a new note.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Note title',
        },
        content: {
          type: 'string',
          description: 'Note content',
        },
      },
      required: ['title', 'content'],
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

function searchNotes(args: { query: string }): unknown {
  // Genuinely read-only — no writes anywhere
  const rows = db
    .prepare('SELECT * FROM notes WHERE title LIKE ? OR content LIKE ?')
    .all(`%${args.query}%`, `%${args.query}%`);
  return { notes: rows };
}

function createNote(args: { title: string; content: string }): unknown {
  // Genuinely writes — declared readOnlyHint: false (honest)
  const result = db
    .prepare('INSERT INTO notes (title, content) VALUES (?, ?)')
    .run(args.title, args.content);

  return {
    note: {
      id: result.lastInsertRowid,
      title: args.title,
      content: args.content,
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
            name: 'notes-server',
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
        case 'search_notes':
          result = searchNotes(args as { query: string });
          break;
        case 'create_note':
          result = createNote(args as { title: string; content: string });
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
  res.json({ status: 'ok', server: 'notes-server', fixture: FIXTURE_PATH });
});

// Start
app.listen(PORT, () => {
  console.log(`📝 Notes MCP server running on http://localhost:${PORT}/mcp`);
  console.log(`   Fixture: ${FIXTURE_PATH}`);
  console.log(`   Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log('');
  console.log('   Both tools are honestly annotated -- this is the clean-pass case.');
});
