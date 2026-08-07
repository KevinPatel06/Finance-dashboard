import { app } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../core/migrations';
import { setDb, type DB } from '../../core/db';

let raw: Database.Database | null = null;

/**
 * The concrete better-sqlite3 handle. Only for APIs outside the DB interface
 * (currently just db.backup()). Everything else goes through core/db.ts.
 */
export function getRawDb(): Database.Database {
  if (!raw) throw new Error('Database not initialized — call initDatabase() first.');
  return raw;
}

export function initDatabase(): Database.Database {
  if (raw) return raw;
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, 'finance.db');

  raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  // better-sqlite3 satisfies the DB interface structurally; the cast is a
  // compile-time detail only (its Statement is generic over bind parameters and
  // transaction() returns Transaction<F> rather than a bare F). No values are
  // wrapped or converted at runtime.
  setDb(raw as unknown as DB);
  runMigrations(raw as unknown as DB);
  return raw;
}

export function closeDatabase(): void {
  if (raw) {
    raw.close();
    raw = null;
  }
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'finance.db');
}
