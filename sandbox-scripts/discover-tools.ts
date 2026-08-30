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

/**
 * Reliably terminate the spawned server process AND any children npm
 * creates underneath it. `child.kill()` alone only signals the immediate
 * child -- on Windows, spawn(..., {shell:true}) runs the command via
 * cmd.exe, so `.kill()` only terminates that shell wrapper, not the
 * actual node process npm launches underneath it (confirmed directly
 * while testing sandbox-scripts/test-workflow.ts, which uses this exact
 * same spawn pattern: the fixture copy stayed locked and the port stayed
 * listening after calling .kill() alone). `taskkill /t` kills the whole
 * tree.
 */
function killProcessTree(child: ReturnType<typeof spawn>) {
  if (process.platform === 'win32' && child.pid) {
    // execSync, not spawn -- must block until the tree is actually gone
    // before the caller proceeds. Using spawn() here raced ahead of
    // taskkill finishing, confirmed directly while testing this exact
    // pattern in sandbox-scripts/test-workflow.ts.
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // Already exited on its own -- taskkill returns non-zero, fine.
    }
  } else {
    child.kill();
  }
}

async function waitForServer(port: string) {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }),
      });
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server start timeout');
}

async function main() {
  console.log(`[discover-tools] Starting discovery for ${REPO_URL}`);

  if (existsSync(SANDBOX_DIR)) {
    await rm(SANDBOX_DIR, { recursive: true, force: true });
  }
  console.log(`[discover-tools] Cloning to ${CLONE_DIR}...`);
  execSync(`git clone "${REPO_URL}" "${CLONE_DIR}"`, { stdio: 'inherit' });

  const targetDir = path.join(CLONE_DIR, SERVER_DIR);
  console.log(`[discover-tools] Installing dependencies in ${targetDir}...`);
  execSync('npm install', { cwd: targetDir, stdio: 'inherit' });

  if (existsSync(path.join(targetDir, 'src', 'seed-fixture.ts'))) {
    console.log('[discover-tools] Seeding fixture...');
    execSync('npm run seed', { cwd: targetDir, stdio: 'inherit' });
  }

  console.log(`[discover-tools] Starting server on port ${PORT}...`);
  const serverProcess = spawn('npm', ['run', 'start'], {
    cwd: targetDir,
    env: { ...process.env, PORT },
    stdio: 'pipe',
    shell: true,
  });

  serverProcess.stderr.on('data', (d) => console.error(`[server err]: ${d}`));

  try {
    await waitForServer(PORT);
    console.log('[discover-tools] Server started. Calling tools/list...');

    const res = await fetch(`http://localhost:${PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    if (!res.ok) {
      throw new Error(`tools/list failed with status ${res.status}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`tools/list JSON-RPC error: ${JSON.stringify(data.error)}`);
    }

    console.log('\n[discover-tools] ✅ Discovered Tools:\n');
    console.log(JSON.stringify(data, null, 2));

  } finally {
    console.log('\n[discover-tools] Shutting down server...');
    killProcessTree(serverProcess);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error('[discover-tools] ❌ Error:', err.message);
  process.exit(1);
});
