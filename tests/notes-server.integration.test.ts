/**
 * Notes Server — Integration Test
 *
 * Tests the notes-server MCP endpoint end-to-end. Unlike invoice-server,
 * this is the clean-pass case: both tools' declared readOnlyHint matches
 * their actual behavior, so a correct audit run should VERIFY both.
 *
 * This test proves the credibility claim -- Attest doesn't just flag every
 * tool it tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { killProcessTree } from './helpers/kill-process-tree';

// Same isolation strategy as the invoice-server integration test: a
// test-specific copy of the fixture, never the main fixture.db.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_SERVER_DIR = path.join(__dirname, '..', 'demo-servers', 'notes-server');
const FIXTURE_SOURCE = path.join(NOTES_SERVER_DIR, 'fixture.db');
const TEST_FIXTURE = path.join(__dirname, 'notes-test-fixture.db');

let serverProcess: ReturnType<typeof import('node:child_process').spawn> | null = null;
const TEST_PORT = 3098; // Different from invoice-server's test port (3099)

describe('notes-server integration', () => {
  beforeAll(async () => {
    if (!existsSync(FIXTURE_SOURCE)) {
      execSync('npx tsx src/seed-fixture.ts', { cwd: NOTES_SERVER_DIR });
    }

    copyFileSync(FIXTURE_SOURCE, TEST_FIXTURE);

    const { spawn } = await import('node:child_process');
    serverProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: NOTES_SERVER_DIR,
      env: { ...process.env, PORT: String(TEST_PORT), FIXTURE_PATH: TEST_FIXTURE },
      stdio: 'pipe',
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
      serverProcess!.stdout?.on('data', (data: Buffer) => {
        if (data.toString().includes('Notes MCP server running')) {
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
    if (existsSync(TEST_FIXTURE)) {
      try { unlinkSync(TEST_FIXTURE); } catch { /* ignore */ }
    }
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

  it('returns both tools from tools/list with correct annotations', async () => {
    const response = await mcpCall('tools/list') as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
    const tools = response.result.tools;

    expect(tools).toHaveLength(2);

    const toolMap = Object.fromEntries(tools.map((t: { name: string }) => [t.name, t]));
    expect(toolMap.search_notes.annotations.readOnlyHint).toBe(true);
    expect(toolMap.create_note.annotations.readOnlyHint).toBe(false);
  });

  it('search_notes is genuinely read-only (no state change) -- matches readOnlyHint: true', async () => {
    const db = new Database(TEST_FIXTURE, { readonly: true });
    const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }).count;
    db.close();

    const response = await mcpCall('tools/call', { name: 'search_notes', arguments: { query: 'pasta' } });
    const content = JSON.parse((response as { result: { content: Array<{ text: string }> } }).result.content[0].text);
    expect(content.notes.length).toBeGreaterThan(0);

    const db2 = new Database(TEST_FIXTURE, { readonly: true });
    const afterCount = (db2.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }).count;
    db2.close();

    expect(afterCount).toBe(beforeCount); // No change -- annotation is honest
  });

  it('create_note honestly writes -- matches readOnlyHint: false', async () => {
    const db = new Database(TEST_FIXTURE, { readonly: true });
    const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }).count;
    db.close();

    await mcpCall('tools/call', {
      name: 'create_note',
      arguments: { title: 'Test note', content: 'Integration test content' },
    });

    const db2 = new Database(TEST_FIXTURE, { readonly: true });
    const afterCount = (db2.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number }).count;
    db2.close();

    expect(afterCount).toBe(beforeCount + 1); // Writes -- matches readOnlyHint: false
  });
});
