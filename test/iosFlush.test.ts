import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const WASM = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');

/**
 * sql.js resolves its WASM from a bundler asset URL, which Node cannot fetch.
 * Point it at the file on disk so storage.ts can be exercised unmodified.
 */
vi.mock('../src/platform/ios/db', async () => {
  const actual =
    await vi.importActual<typeof import('../src/platform/ios/db')>('../src/platform/ios/db');
  return {
    ...actual,
    createSqlJsDb: (bytes?: Uint8Array) => actual.createSqlJsDb(bytes, WASM),
  };
});

/**
 * In-memory stand-in for Capacitor's Filesystem with realistic async latency.
 *
 * `inFlight` is the whole point: a real file write is not atomic, so two
 * overlapping writes to the same path can interleave and truncate each other.
 */
const files = new Map<string, string>();
let inFlight = 0;
let maxInFlight = 0;
/**
 * Latency of each successive database write (each flush writes the temp file
 * that then becomes finance.db), in order. Scripting it makes an
 * unlucky-but-entirely-legal interleaving reproducible instead of a flake.
 */
let dbWriteDelays: number[] = [];
let dbWrites = 0;
/** Paths whose reads fail even though the file exists. */
let unreadable = new Set<string>();
let listingFails = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    readdir: async () => {
      if (listingFails) throw new Error('Could not list directory');
      return { files: [...files.keys()].map((name) => ({ name, type: 'file' })) };
    },
    readFile: async ({ path: p }: { path: string }) => {
      if (!files.has(p)) throw new Error('File does not exist');
      if (unreadable.has(p)) throw new Error('Read failed');
      return { data: files.get(p)! };
    },
    writeFile: async ({ path: p, data }: { path: string; data: string }) => {
      const delay = p === 'finance.db.tmp' ? (dbWriteDelays[dbWrites++] ?? 0) : 0;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await sleep(delay);
        files.set(p, data);
      } finally {
        inFlight--;
      }
      return {};
    },
    copy: async ({ from, to }: { from: string; to: string }) => {
      if (!files.has(from)) throw new Error('File does not exist');
      files.set(to, files.get(from)!);
      return {};
    },
    rename: async ({ from, to }: { from: string; to: string }) => {
      if (!files.has(from)) throw new Error('File does not exist');
      files.set(to, files.get(from)!);
      files.delete(from);
    },
  },
}));

import { openDatabase, flush } from '../src/platform/ios/storage';
import { createSqlJsDb } from '../src/platform/ios/db';
import { setDb, type DB } from '../core/db';
import { runMigrations } from '../core/migrations';
import * as repo from '../core/repo';

/** Read a persisted file back and ask it what it actually contains. */
async function goalsOnDisk(file = 'finance.db'): Promise<string[]> {
  const b64 = files.get(file);
  if (!b64) return [];
  const bin = Buffer.from(b64, 'base64');
  const disk = await createSqlJsDb(new Uint8Array(bin));
  const rows = disk.prepare('SELECT name FROM savings_goals ORDER BY name').all() as {
    name: string;
  }[];
  disk.close();
  return rows.map((r) => r.name);
}

const goal = (name: string) => repo.createGoal({ name, target_amount: 1000, color: '#10b981' });

/** Relaunch: reopen from whatever is on disk, as the app does at boot. */
async function relaunch() {
  const opened = await openDatabase();
  setDb(opened.db as DB);
  runMigrations(opened.db);
  return opened;
}

describe('iOS persistence', () => {
  beforeEach(async () => {
    files.clear();
    inFlight = 0;
    maxInFlight = 0;
    dbWrites = 0;
    dbWriteDelays = [];
    unreadable = new Set();
    listingFails = false;
    const { db } = await openDatabase();
    setDb(db as DB);
    runMigrations(db);
    await flush();
    dbWrites = 0;
    inFlight = 0;
    maxInFlight = 0;
  });

  it('never lets two writes to the database file overlap', async () => {
    dbWriteDelays = [5, 0];

    // Two mutating calls back to back. The theme context fires settings writes
    // without awaiting them, so this overlap is exactly what the app does.
    const a = flush();
    repo.createGoal({ name: 'Emergency fund', target_amount: 5000, color: '#10b981' });
    const b = flush();
    await Promise.all([a, b]);

    expect(maxInFlight).toBe(1);
  });

  it('does not let an in-flight flush overwrite newer data with a stale snapshot', async () => {
    // Mirrors Welcome.finish(): setUserName() fires a settings write it never
    // awaits, then creates the goals and awaits those. The first write is slow
    // enough that it lands last, carrying a snapshot taken before the goals
    // existed.
    dbWriteDelays = [30, 0];
    repo.updateSettings({ user_name: 'Kevin' });
    const stale = flush(); // un-awaited, exactly as theme.tsx does

    repo.createGoal({ name: 'Emergency fund', target_amount: 5000, color: '#10b981' });
    repo.createGoal({ name: 'Vacation', target_amount: 2000, color: '#3b82f6' });
    await flush();
    await stale;

    expect(await goalsOnDisk()).toEqual(['Emergency fund', 'Vacation']);
  });

  it('writes through a temp file and keeps the previous copy as the backup', async () => {
    goal('A');
    await flush();
    goal('B');
    await flush();

    expect(await goalsOnDisk()).toEqual(['A', 'B']);
    expect(await goalsOnDisk('finance.db.bak')).toEqual(['A']);
    expect(files.has('finance.db.tmp')).toBe(false);
  });

  it('opens the backup when finance.db is damaged, and never overwrites the backup with it', async () => {
    goal('A');
    await flush();
    goal('B');
    await flush(); // backup now holds A
    files.set('finance.db', Buffer.from('not a database at all').toString('base64'));

    const { recovered, isNew } = await relaunch();
    expect({ recovered, isNew }).toEqual({ recovered: true, isNew: false });
    expect(repo.listGoals().map((g) => g.name)).toEqual(['A']);

    goal('C');
    await flush();
    expect(await goalsOnDisk()).toEqual(['A', 'C']);
    expect(await goalsOnDisk('finance.db.bak')).toEqual(['A']);
  });

  it('treats an empty finance.db as a write that never finished, not a new install', async () => {
    goal('A');
    await flush();
    await flush(); // backup now holds A too
    files.set('finance.db', '');

    const { recovered, isNew } = await relaunch();
    expect({ recovered, isNew }).toEqual({ recovered: true, isNew: false });
    expect(repo.listGoals().map((g) => g.name)).toEqual(['A']);
  });

  it('uses the finished temp file when a flush died after finance.db was removed', async () => {
    goal('A');
    await flush();
    goal('B');
    await flush();
    files.set('finance.db.tmp', files.get('finance.db')!);
    files.delete('finance.db');

    await relaunch();
    expect(repo.listGoals().map((g) => g.name)).toEqual(['A', 'B']);
  });

  it('refuses to start, touching nothing, when finance.db exists but cannot be read', async () => {
    goal('A');
    await flush();
    const before = new Map(files);
    unreadable.add('finance.db');

    await expect(openDatabase()).rejects.toThrow();
    expect(files).toEqual(before);
  });

  it('refuses to start when the data directory cannot be listed', async () => {
    listingFails = true;
    await expect(openDatabase()).rejects.toThrow();
  });

  it('refuses to start when no copy is intact, rather than starting empty', async () => {
    files.set('finance.db', Buffer.from('garbage').toString('base64'));
    files.set('finance.db.bak', Buffer.from('more garbage').toString('base64'));
    await expect(openDatabase()).rejects.toThrow();
  });
});
