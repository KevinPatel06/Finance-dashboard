import { makeTestDb } from './helpers/makeDb';
import { setDb } from '../core/db';
import { runRepoContract } from './shared/repoContract';

// Node-side reference driver. See test/helpers/nodeSqlite.ts for why this is
// node:sqlite rather than better-sqlite3 (Electron-ABI binary, unloadable here).
// The desktop driver is covered by the same interface plus a `npm run dev` smoke test.
runRepoContract('node:sqlite', makeTestDb, (db) => setDb(db as never));
