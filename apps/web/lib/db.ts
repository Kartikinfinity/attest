import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Store the database in a hidden directory in the project root so it survives dev reloads
const DB_DIR = path.join(process.cwd(), '.attest-data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'attest.db');
const db = new Database(DB_PATH, { timeout: 8000 });

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 8000');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    repo_url TEXT NOT NULL,
    server_dir TEXT NOT NULL,
    status TEXT NOT NULL,
    session_id TEXT,
    overall_verdict TEXT,
    failure_category TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tool_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    declared_read_only BOOLEAN,
    verdict TEXT NOT NULL,
    severity TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    test_input TEXT NOT NULL,
    before_snapshot TEXT NOT NULL,
    after_snapshot TEXT NOT NULL,
    diff TEXT NOT NULL,
    raw_response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
  );
`);

// Migration for existing databases created before failure_category existed
// (CREATE TABLE IF NOT EXISTS above only applies to a brand-new db file --
// it does not retroactively add columns to an already-created runs table,
// and this project already has real run history predating this column).
// SQLite has no "ADD COLUMN IF NOT EXISTS"; guard with a try/catch instead.
try {
  db.exec('ALTER TABLE runs ADD COLUMN failure_category TEXT');
} catch {
  // Column already exists -- expected on every run after the first.
}

export { db };
