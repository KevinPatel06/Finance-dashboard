import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import type { DB, Stmt } from '../../../core/db';

/**
 * Emitted at this exact name by the emit-sql-wasm plugin in vite.config.ios.ts,
 * and resolved relative to the page. Deliberately NOT a `?url` import: Vite
 * emits those eagerly even when the importing module is unreachable, which put
 * 660KB of dead WASM into the Electron bundle.
 */
const DEFAULT_WASM = 'sql-wasm.wasm';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SqlJsDb extends DB {
  export(): Uint8Array;
  close(): void;
}

/**
 * Implements core/db.ts's DB interface over sql.js.
 *
 * sql.js is synchronous once initialised, which is what lets core/repo.ts stay
 * byte-for-byte identical across platforms. Only initSqlJs() is async, and that
 * happens once at app boot — never per query.
 */
function wrap(db: SqlJsDatabase): SqlJsDb {
  // Tracks whether a BEGIN is already open, so nested transaction() calls
  // (materializeRecurringExpenses calls createExpense, which opens its own)
  // do not attempt an illegal nested BEGIN. Mirrors better-sqlite3.
  let inTransaction = false;

  const prepare = (sql: string): Stmt => ({
    all<T>(...params: any[]): T[] {
      const st = db.prepare(sql);
      try {
        if (params.length) st.bind(params as never[]);
        const out: T[] = [];
        while (st.step()) out.push(st.getAsObject() as T);
        return out;
      } finally {
        st.free();
      }
    },
    get<T>(...params: any[]): T | undefined {
      const st = db.prepare(sql);
      try {
        if (params.length) st.bind(params as never[]);
        return st.step() ? (st.getAsObject() as T) : undefined;
      } finally {
        st.free();
      }
    },
    run(...params: any[]) {
      db.run(sql, params as never[]);
      // sql.js exposes no lastInsertRowid accessor; query it. The extra
      // statement is negligible and only runs on writes.
      const res = db.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = res.length ? (res[0].values[0][0] as number) : 0;
      return { changes: db.getRowsModified(), lastInsertRowid };
    },
  });

  return {
    prepare,
    exec(sql: string) {
      db.exec(sql);
    },
    transaction<F extends (...args: any[]) => any>(fn: F): F {
      return ((...args: any[]) => {
        const outermost = !inTransaction;
        if (outermost) {
          db.run('BEGIN');
          inTransaction = true;
        }
        try {
          const result = fn(...args);
          if (outermost) {
            db.run('COMMIT');
            inTransaction = false;
          }
          return result;
        } catch (err) {
          if (outermost) {
            db.run('ROLLBACK');
            inTransaction = false;
          }
          throw err;
        }
      }) as F;
    },
    export: () => db.export(),
    close: () => db.close(),
  };
}

/**
 * @param bytes    existing database to open; omit for a fresh one
 * @param wasmPath override for the WASM binary's location. Defaults to the
 *                 bundled asset URL, which is what the app uses. Tests pass a
 *                 filesystem path, since Node cannot fetch a bundler URL.
 */
export async function createSqlJsDb(
  bytes?: Uint8Array,
  wasmPath: string = DEFAULT_WASM
): Promise<SqlJsDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database();
  // WAL is meaningless for an in-memory DB, so only foreign_keys is set here.
  db.run('PRAGMA foreign_keys = ON');
  return wrap(db);
}
