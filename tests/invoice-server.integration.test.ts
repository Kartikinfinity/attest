/**
 * Invoice Server — Integration Test
 *
 * Tests the invoice-server MCP endpoint end-to-end, including
 * verifying the planted readOnlyHint mismatch:
 *
 *   get_invoice declares readOnlyHint: true
 *   but secretly writes a row to audit_log
 *
 * This test proves the mismatch is real and detectable by
 * comparing fixture state before/after the tool call.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { killProcessTree } from './helpers/kill-process-tree';

// We'll use a test-specific copy of the fixture to avoid contaminating
// the main fixture.db (same isolation strategy Attest uses in production)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INVOICE_SERVER_DIR = path.join(__dirname, '..', 'demo-servers', 'invoice-server');
const FIXTURE_SOURCE = path.join(INVOICE_SERVER_DIR, 'fixture.db');
const TEST_FIXTURE = path.join(__dirname, 'test-fixture.db');

// Server process management
let serverProcess: ReturnType<typeof import('node:child_process').spawn> | null = null;
const TEST_PORT = 3099; // Use a different port so we don't clash with a running server

describe('invoice-server integration', () => {
  beforeAll(async () => {
    // Ensure the source fixture exists (seed it if not)
    if (!existsSync(FIXTURE_SOURCE)) {
      execSync('npx tsx src/seed-fixture.ts', { cwd: INVOICE_SERVER_DIR });
    }

    // Copy fixture for this test run
    copyFileSync(FIXTURE_SOURCE, TEST_FIXTURE);

    // Start the server on a test port
    const { spawn } = await import('node:child_process');
    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: INVOICE_SERVER_DIR,
      env: { ...process.env, PORT: String(TEST_PORT), FIXTURE_PATH: TEST_FIXTURE },
      stdio: 'pipe',
      shell: true,
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      serverProcess!.stdout?.on('data', (data: Buffer) => {
        if (data.toString().includes('Invoice MCP server running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess!.stderr?.on('data', (data: Buffer) => {
        console.error('Server stderr:', data.toString());
      });
    });
  });

  afterAll(() => {
    if (serverProcess) {
      killProcessTree(serverProcess);
      serverProcess = null;
    }
    // Clean up test fixture
    if (existsSync(TEST_FIXTURE)) {
      try { unlinkSync(TEST_FIXTURE); } catch { /* ignore */ }
    }
    // Also clean WAL/SHM files
    for (const suffix of ['-wal', '-shm']) {
      const f = TEST_FIXTURE + suffix;
      if (existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }
  });

  async function mcpCall(method: string, params?: Record<string, unknown>) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      ...(params ? { params } : {}),
    });
    const res = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return res.json();
  }

  it('returns all 3 tools from tools/list with correct annotations', async () => {
    const response = await mcpCall('tools/list') as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
    const tools = response.result.tools;

    expect(tools).toHaveLength(3);

    const toolMap = Object.fromEntries(tools.map((t: { name: string }) => [t.name, t]));
    expect(toolMap.list_invoices.annotations.readOnlyHint).toBe(true);
    expect(toolMap.get_invoice.annotations.readOnlyHint).toBe(true);  // The lie
    expect(toolMap.create_invoice.annotations.readOnlyHint).toBe(false);
  });

  it('list_invoices is genuinely read-only (no state change)', async () => {
    const db = new Database(TEST_FIXTURE, { readonly: true });
    const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;
    db.close();

    await mcpCall('tools/call', { name: 'list_invoices', arguments: {} });

    const db2 = new Database(TEST_FIXTURE, { readonly: true });
    const afterCount = (db2.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;
    db2.close();

    expect(afterCount).toBe(beforeCount); // No change — genuinely read-only
  });

  it('get_invoice secretly writes to audit_log despite readOnlyHint: true (THE WOW CASE)', async () => {
    const db = new Database(TEST_FIXTURE, { readonly: true });
    const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;
    db.close();

    // Call the "read-only" tool
    const response = await mcpCall('tools/call', { name: 'get_invoice', arguments: { invoice_id: 1 } });

    // Verify it returned valid invoice data
    const content = JSON.parse((response as { result: { content: Array<{ text: string }> } }).result.content[0].text);
    expect(content.invoice.customer).toBe('Acme Corp');

    // NOW CHECK: did it secretly write?
    const db2 = new Database(TEST_FIXTURE, { readonly: true });
    const afterCount = (db2.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;
    const lastEntry = db2.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get() as { action: string; entity: string; entity_id: number };
    db2.close();

    // 🔴 THIS IS THE MISMATCH — readOnlyHint says "I don't write"
    // but afterCount > beforeCount proves it did
    expect(afterCount).toBe(beforeCount + 1);
    expect(lastEntry.action).toBe('viewed');
    expect(lastEntry.entity).toBe('invoice');
    expect(lastEntry.entity_id).toBe(1);
  });

  it('create_invoice honestly writes (readOnlyHint: false)', async () => {
    const db = new Database(TEST_FIXTURE, { readonly: true });
    const beforeInvoiceCount = (db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number }).count;
    db.close();

    await mcpCall('tools/call', {
      name: 'create_invoice',
      arguments: { customer: 'Test Co', amount: 500 },
    });

    const db2 = new Database(TEST_FIXTURE, { readonly: true });
    const afterInvoiceCount = (db2.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number }).count;
    db2.close();

    expect(afterInvoiceCount).toBe(beforeInvoiceCount + 1); // Writes — matches readOnlyHint: false
  });
});
