import { runMigrations } from '../../electron/db/migrations';
import { makeNodeSqliteDb, wrapNodeSqlite, type TestDb } from './nodeSqlite';

/** Fresh in-memory database with all migrations applied. */
export function makeTestDb(): TestDb {
  const db = wrapNodeSqlite(makeNodeSqliteDb());
  runMigrations(db as never);
  return db;
}
