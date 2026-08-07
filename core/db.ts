/**
 * The complete SQLite surface used by core/repo.ts and core/migrations.ts.
 *
 * Deliberately minimal: better-sqlite3 satisfies it structurally with no
 * runtime adapter, and the iOS sql.js shim only has to implement these four
 * things. Keeping this surface small is what makes the port cheap — do not
 * widen it without a good reason.
 *
 * Binding is positional (`?`) only. No named parameters, no object-form
 * binding — the sql.js and node:sqlite adapters both depend on that.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Stmt {
  all<T = any>(...params: any[]): T[];
  get<T = any>(...params: any[]): T | undefined;
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
}

export interface DB {
  prepare(sql: string): Stmt;
  exec(sql: string): void;
  transaction<F extends (...args: any[]) => any>(fn: F): F;
}

let db: DB | null = null;

export function setDb(next: DB): void {
  db = next;
}

export function getDb(): DB {
  if (!db) throw new Error('Database not initialized — call setDb() first.');
  return db;
}
