import { spawn, execSync } from 'node:child_process';

/**
 * Reliably terminate a spawned server process AND its children.
 *
 * `child.kill()` alone only signals the immediate child. These tests spawn
 * servers with `shell: true`, which on Windows runs the command through
 * cmd.exe -- so `.kill()` terminates that shell wrapper and leaves the
 * actual node process running, still holding its port and a file lock on
 * better-sqlite3's native binding.
 *
 * This is not theoretical: a leaked notes-server was found still listening
 * on the test port after a completed run, and its lock caused an
 * unrelated `npm rebuild` to fail with EPERM. Repeated test runs would
 * also eventually collide on the port.
 *
 * `taskkill /t` kills the whole tree, and execSync (not spawn) is used so
 * the caller can rely on the processes actually being gone before it
 * proceeds to delete the fixture files they were holding open.
 *
 * The same pattern exists inline in sandbox-scripts/*.ts. Those copies are
 * deliberately left standalone: those scripts are executed on their own
 * inside the audit sandbox, and are in the verified demo-critical path.
 */
export function killProcessTree(child: ReturnType<typeof spawn> | null): void {
  if (!child) return;

  if (process.platform === 'win32' && child.pid) {
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // Non-zero exit just means it had already exited -- fine.
    }
  } else {
    child.kill();
  }
}
