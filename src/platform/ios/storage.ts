import { Filesystem, Directory } from '@capacitor/filesystem';
import { createSqlJsDb, type SqlJsDb } from './db';

const DB_FILE = 'finance.db';
const BAK_FILE = 'finance.db.bak';
/** Each flush writes here first, then renames it over DB_FILE. */
const TMP_FILE = 'finance.db.tmp';

let handle: SqlJsDb | null = null;
/**
 * Whether DB_FILE on disk is known to be intact. Only an intact file is
 * rotated into the backup: after recovering from a damaged one, copying it
 * over the backup would destroy the only good copy.
 */
let diskIsGood = false;

export function getHandle(): SqlJsDb {
  if (!handle) throw new Error('iOS database not opened — call openDatabase() first.');
  return handle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // chunked so large buffers don't blow the argument limit
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Names of the files in the data directory. Throws if it can't be listed. */
async function dataFiles(): Promise<Set<string>> {
  const res = await Filesystem.readdir({ path: '', directory: Directory.Data });
  return new Set(res.files.map((f) => f.name));
}

/**
 * Opens one copy of the database, or returns null if its contents are damaged.
 * A file that can't be read at all throws instead: that says nothing about the
 * data, so it must stop the launch rather than fall back to an older copy.
 */
async function tryOpen(path: string): Promise<SqlJsDb | null> {
  const res = await Filesystem.readFile({ path, directory: Directory.Data });
  const bytes = fromBase64(res.data as string);
  // An empty file is a write that never finished, not a new database.
  if (bytes.length === 0) return null;
  let db: SqlJsDb | undefined;
  try {
    db = await createSqlJsDb(bytes);
    const check = db.prepare('PRAGMA quick_check').get<{ quick_check: string }>();
    if (check?.quick_check === 'ok') return db;
  } catch {
    // Not a database, or a damaged one.
  }
  db?.close();
  return null;
}

/**
 * Open (or create) the on-disk database and load it into memory.
 *
 * Copies are tried newest-acknowledged first. finance.db is what the last
 * completed flush wrote. The temp file is newer, but it only matters when a
 * flush died mid-rename and took finance.db with it. The backup is one flush
 * older than finance.db. `recovered` means finance.db itself wasn't usable.
 *
 * Nothing here ever writes. A fresh database is only created when there is
 * no copy at all; if copies exist and none opens, this throws so the launch
 * stops with every file left as it was.
 */
export async function openDatabase(): Promise<{ db: SqlJsDb; isNew: boolean; recovered: boolean }> {
  const present = await dataFiles();
  for (const path of [DB_FILE, TMP_FILE, BAK_FILE]) {
    if (!present.has(path)) continue;
    const db = await tryOpen(path);
    if (!db) continue;
    handle = db;
    diskIsGood = path === DB_FILE;
    return { db, isNew: false, recovered: path !== DB_FILE };
  }
  // A lone damaged temp file is a first launch whose first flush died.
  if (present.has(DB_FILE) || present.has(BAK_FILE)) {
    throw new Error('No intact copy of the database could be opened.');
  }
  handle = await createSqlJsDb();
  diskIsGood = false;
  return { db: handle, isNew: true, recovered: false };
}

/** Serialises flushes; `queued` is the one pending pass callers can share. */
let tail: Promise<void> = Promise.resolve();
let queued = false;

/** Rotate one backup, then replace the live file. Never run concurrently. */
async function writeSnapshot(): Promise<void> {
  if (!handle) return;
  // Snapshot INSIDE the critical section. Taking it before waiting for a turn
  // is what let a slow write land last carrying pre-write state.
  const bytes = handle.export();
  // Capacitor's writeFile is a plain, non-atomic write, so a kill mid-write
  // would leave finance.db half-written. Write beside it and rename it into
  // place instead: an interrupted flush can only leave a stray temp file.
  await Filesystem.writeFile({
    path: TMP_FILE,
    data: toBase64(bytes),
    directory: Directory.Data,
  });
  if (diskIsGood) {
    try {
      await Filesystem.copy({ from: DB_FILE, to: BAK_FILE, directory: Directory.Data });
    } catch {
      // A missed rotation only leaves the backup one flush older.
    }
  }
  await Filesystem.rename({ from: TMP_FILE, to: DB_FILE, directory: Directory.Data });
  diskIsGood = true;
}

/**
 * Flush the in-memory DB to disk, rotating one backup first.
 *
 * The DB lives in memory, so this is what makes writes durable. Called after
 * every mutating API call and when iOS backgrounds the app.
 *
 * Flushes are serialised for two reasons, both of which cost real data before:
 * overlapping `writeFile` calls to the same path can interleave and truncate
 * each other, and an unawaited flush (the theme context fires settings writes
 * without awaiting them) could finish last while carrying a snapshot taken
 * before newer rows existed — silently reverting them.
 */
export function flush(): Promise<void> {
  if (!handle) return Promise.resolve();
  // A pass that hasn't started yet will snapshot when it runs, so it already
  // covers whatever this caller just wrote. Share it instead of queueing again.
  if (queued) return tail;
  queued = true;
  const run = async () => {
    queued = false;
    await writeSnapshot();
  };
  // Run on both settle paths so one failed write cannot wedge the queue.
  tail = tail.then(run, run);
  return tail;
}

/** Read the live database file as base64 — used by backup/share. */
export async function readDbBase64(): Promise<string> {
  const res = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
  return res.data as string;
}
