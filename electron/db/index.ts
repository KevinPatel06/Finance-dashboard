import { app } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first.');
  return db;
}

/** Inject a database directly. Used by tests to supply an in-memory instance. */
export function setDb(next: Database.Database): void {
  db = next;
}

export function initDatabase(): Database.Database {
  if (db) return db;
  const userData = app.getPath('userData');
  if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, 'finance.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'finance.db');
}
