/**
 * Notes Server — Fixture Seeder
 *
 * Creates a fresh SQLite fixture database with a `notes` table seeded with
 * 3 sample notes. Unlike invoice-server, nothing here is a planted lie --
 * both tools' declared annotations match their actual behavior, so a
 * correct audit run should VERIFY both.
 *
 * Usage: npx tsx src/seed-fixture.ts [output-path]
 * Default output: ./fixture.db
 */

import Database from 'better-sqlite3';
import path from 'node:path';

const outputPath = process.argv[2] ?? path.join(import.meta.dirname, '..', 'fixture.db');

const db = new Database(outputPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id      INTEGER PRIMARY KEY,
    title   TEXT    NOT NULL,
    content TEXT    NOT NULL,
    created TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Clear existing data (idempotent seeding)
db.exec('DELETE FROM notes;');

const insertNote = db.prepare(
  'INSERT INTO notes (id, title, content) VALUES (?, ?, ?)'
);
insertNote.run(1, 'Grocery list', 'Milk, eggs, bread');
insertNote.run(2, 'Meeting notes', 'Discussed Q3 roadmap with the team');
insertNote.run(3, 'Recipe idea', 'Try the lemon pasta recipe this weekend');

db.close();

console.log(`✅ Fixture seeded at: ${outputPath}`);
console.log('   notes: 3 rows');
