/**
 * Sandbox Script: Discover Tools
 *
 * This script is intended to be run by the attest-auditor agent inside
 * the TrueForge/Daytona sandbox. It automates the preparation phase:
 *
 * 1. Clones the target repository.
 * 2. Installs dependencies.
 * 3. Starts the server.
 * 4. Calls the MCP tools/list endpoint.
 * 5. Returns the tool list and annotations.
 *
 * Usage:
 *   npx tsx sandbox-scripts/discover-tools.ts <repo-url> <server-dir> <port>
 */

import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';

const REPO_URL = process.argv[2];
const SERVER_DIR = process.argv[3];
const PORT = process.argv[4] ?? '3001';

if (!REPO_URL || !SERVER_DIR) {
  console.error('Usage: npx tsx discover-tools.ts <repo-url> <server-dir> [port]');
  process.exit(1);
}

const SANDBOX_DIR = path.join(process.cwd(), '.sandbox-tmp');
const CLONE_DIR = path.join(SANDBOX_DIR, 'repo');

async function main() {
  console.log(`[discover-tools] Starting discovery for ${REPO_URL}`);

  // 1. Clean and clone
  if (existsSync(SANDBOX_DIR)) {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  }
  console.log(`[discover-tools] Cloning to ${CLONE_DIR}...`);
  execSync(`git clone "${REPO_URL}" "${CLONE_DIR}"`, { stdio: 'inherit' });

  // 2. Install dependencies
  const targetDir = path.join(CLONE_DIR, SERVER_DIR);
  console.log(`[discover-tools] Installing dependencies in ${targetDir}...`);
  execSync('npm install', { cwd: targetDir, stdio: 'inherit' });

  // Seed fixture if requested (for invoice-server specifically, as an MVP shortcut)
  if (existsSync(path.join(targetDir, 'src', 'seed-fixture.ts'))) {
    console.log('[discover-tools] Seeding fixture...');
    execSync('npm run seed', { cwd: targetDir, stdio: 'inherit' });
  }

  // 3. Start server
  console.log(`[discover-tools] Starting server on port ${PORT}...`);
  const serverProcess = spawn('npm', ['run', 'start'], {
    cwd: targetDir,
    env: { ...process.env, PORT },
    stdio: 'pipe',
    shell: true,
  });

  serverProcess.stderr.on('data', (d) => console.error(`[server err]: ${d}`));

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 15000);
    serverProcess.stdout.on('data', (d) => {
      // console.log(`[server]: ${d}`);
      if (d.toString().includes('running on http')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  console.log('[discover-tools] Server started. Calling tools/list...');

  // 4. Call tools/list
  const res = await fetch(`http://localhost:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });

  if (!res.ok) {
    throw new Error(`tools/list failed with status ${res.status}`);
  }

  const data = await res.json();
  console.log('\n[discover-tools] ✅ Discovered Tools:\n');
  console.log(JSON.stringify(data, null, 2));

  // Cleanup
  console.log('\n[discover-tools] Shutting down server...');
  serverProcess.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('[discover-tools] ❌ Error:', err.message);
  process.exit(1);
});
