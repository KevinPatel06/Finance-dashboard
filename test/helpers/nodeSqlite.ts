/* eslint-disable @typescript-eslint/no-explicit-any */

// Vite's builtin list predates node:sqlite, so a static import gets rewritten
// to a bare "sqlite" specifier and fails to resolve. getBuiltinModule bypasses
// bundler resolution entirely.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

export interface DatabaseSync {
  prepare(sql: string): {
    all(...params: never[]): unknown[];
    get(...params: never[]): unknown;
    run(...params: never[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
  close(): void;
}

/**
 * Adapts Node's built-in SQLite to the same shape core/repo.ts expects.
 *
 * Why not better-sqlite3 here: this project's better-sqlite3 binary is built
 * against Electron's ABI (NODE_MODULE_VERSION 130) by `electron-rebuild`, so
 * plain Node (137) cannot load it, and rebuilding it for Node would break the
 * desktop app. node:sqlite is real SQLite, ships with Node 24, needs no native
 * build, and satisfies prepare/exec/run/get/all natively — only transaction()
 * has to be added.
 */
export interface TestDb {
  prepare(sql: string): {
    all<T = unknown>(...params: unknown[]): T[];
    get<T = unknown>(...params: unknown[]): T | undefined;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
  transaction<F extends (...args: any[]) => any>(fn: F): F;
  close(): void;
}

export function wrapNodeSqlite(db: DatabaseSync): TestDb {
  // Mirrors better-sqlite3: a nested transaction() joins the outer one rather
  // than opening a second BEGIN, which SQLite does not allow.
  let inTransaction = false;

  return {
    prepare(sql: string) {
      const st = db.prepare(sql);
      return {
        all<T>(...params: unknown[]): T[] {
          return st.all(...(params as never[])) as T[];
        },
        get<T>(...params: unknown[]): T | undefined {
          return st.get(...(params as never[])) as T | undefined;
        },
        run(...params: unknown[]) {
          const r = st.run(...(params as never[]));
          return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
        },
      };
    },
    exec(sql: string) {
      db.exec(sql);
    },
    transaction<F extends (...args: any[]) => any>(fn: F): F {
      return ((...args: any[]) => {
        const outermost = !inTransaction;
        if (outermost) {
          db.exec('BEGIN');
          inTransaction = true;
        }
        try {
          const result = fn(...args);
          if (outermost) {
            db.exec('COMMIT');
            inTransaction = false;
          }
          return result;
        } catch (err) {
          if (outermost) {
            db.exec('ROLLBACK');
            inTransaction = false;
          }
          throw err;
        }
      }) as F;
    },
    close() {
      db.close();
    },
  };
}

export function makeNodeSqliteDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
