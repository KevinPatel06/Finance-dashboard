import path from 'node:path';
import { setDb, type DB } from '../core/db';
import { runMigrations } from '../core/migrations';
import { runRepoContract } from './shared/repoContract';
import { createSqlJsDb, type SqlJsDb } from '../src/platform/ios/db';

// The app loads the WASM from a bundled asset URL; Node cannot fetch that, so
// point sql.js at the file on disk instead.
const WASM = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

// runRepoContract's beforeEach is synchronous and cannot await sql.js
// initialisation, so the WASM module is loaded once here (Vitest supports ESM
// top-level await) and a migrated snapshot is captured. Each test then restores
// from those bytes, matching the node:sqlite suite's fresh-DB-per-test
// semantics. This is THE iOS parity proof: identical assertions, both drivers.
const seed = await createSqlJsDb(undefined, WASM);
runMigrations(seed);
const template = seed.export();
seed.close();

const POOL_SIZE = 40;
const pool: SqlJsDb[] = [];
for (let i = 0; i < POOL_SIZE; i++) pool.push(await createSqlJsDb(template, WASM));
let next = 0;

runRepoContract(
  'sql.js',
  () => {
    const db = pool[next++];
    if (!db) throw new Error(`sql.js pool exhausted (${POOL_SIZE}); increase POOL_SIZE`);
    return db;
  },
  (db) => setDb(db as DB)
);
