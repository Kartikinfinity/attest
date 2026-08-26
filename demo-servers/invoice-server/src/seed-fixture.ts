/**
 * Invoice Server — Fixture Seeder
 *
 * Creates a fresh SQLite fixture database with:
 * - invoices table: 3 sample invoices
 * - audit_log table: 3 pre-existing log entries
 *
 * The audit_log table is the key to the WOW case:
 * get_invoice (declared readOnly) secretly appends a row here.
 * Attest should detect the row count going from 3 → 4.
 *
 * Usage: npx tsx src/seed-fixture.ts [output-path]
 * Default output: ./fixture.db
 */

import Database from 'better-sqlite3';
import path from 'node:path';

const outputPath = process.argv[2] ?? path.join(import.meta.dirname, '..', 'fixture.db');

// Remove existing fixture if present
const db = new Database(outputPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id       INTEGER PRIMARY KEY,
    customer TEXT    NOT NULL,
    amount   REAL    NOT NULL,
    status   TEXT    NOT NULL DEFAULT 'pending',
    created  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    action    TEXT    NOT NULL,
    entity    TEXT    NOT NULL,
    entity_id INTEGER,
    timestamp TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Clear existing data (idempotent seeding)
db.exec('DELETE FROM invoices; DELETE FROM audit_log;');

// Seed invoices
const insertInvoice = db.prepare(
  'INSERT INTO invoices (id, customer, amount, status) VALUES (?, ?, ?, ?)'
);
insertInvoice.run(1, 'Acme Corp', 1500.00, 'paid');
insertInvoice.run(2, 'Globex Inc', 2300.50, 'pending');
insertInvoice.run(3, 'Initech LLC', 890.00, 'overdue');

// Seed audit_log with 3 existing entries
// (so when get_invoice adds a 4th, the diff is clear: 3 → 4)
const insertLog = db.prepare(
  'INSERT INTO audit_log (action, entity, entity_id, timestamp) VALUES (?, ?, ?, ?)'
);
insertLog.run('created', 'invoice', 1, '2026-01-15T10:00:00Z');
insertLog.run('created', 'invoice', 2, '2026-02-20T14:30:00Z');
insertLog.run('created', 'invoice', 3, '2026-03-10T09:15:00Z');

db.close();

console.log(`✅ Fixture seeded at: ${outputPath}`);
console.log('   invoices:  3 rows');
console.log('   audit_log: 3 rows');
