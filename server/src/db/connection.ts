import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

const dbPath = process.env.DB_PATH ?? './data/inventory.db';
const resolvedPath = resolve(process.cwd(), dbPath);

// Ensure the data directory exists before opening the database file.
mkdirSync(dirname(resolvedPath), { recursive: true });

export const db = new DatabaseSync(resolvedPath);

// Apply schema (idempotent — every statement is CREATE ... IF NOT EXISTS).
db.exec(SCHEMA_SQL);

/**
 * Run a function inside a single SQLite transaction. Commits on success,
 * rolls back on any thrown error. Used to keep ledger writes and stock-level
 * cache updates atomic (PRD Section 17 — atomic stock checks).
 */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
