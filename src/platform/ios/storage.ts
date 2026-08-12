import { Filesystem, Directory } from '@capacitor/filesystem';
import { createSqlJsDb, type SqlJsDb } from './db';

const DB_FILE = 'finance.db';
const BAK_FILE = 'finance.db.bak';

let handle: SqlJsDb | null = null;

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

async function readDbFile(): Promise<Uint8Array | undefined> {
  try {
    const res = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
    return fromBase64(res.data as string);
  } catch {
    return undefined; // first launch
  }
}

/** Open (or create) the on-disk database and load it into memory. */
export async function openDatabase(): Promise<{ db: SqlJsDb; isNew: boolean }> {
  const bytes = await readDbFile();
  handle = await createSqlJsDb(bytes);
  return { db: handle, isNew: !bytes };
}

/** Serialises flushes; `queued` is the one pending pass callers can share. */
let tail: Promise<void> = Promise.resolve();
let queued = false;

/** Rotate one backup, then overwrite the live file. Never run concurrently. */
async function writeSnapshot(): Promise<void> {
  if (!handle) return;
  // Snapshot INSIDE the critical section. Taking it before waiting for a turn
  // is what let a slow write land last carrying pre-write state.
  const bytes = handle.export();
  try {
    const prev = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
    await Filesystem.writeFile({
      path: BAK_FILE,
      data: prev.data as string,
      directory: Directory.Data,
    });
  } catch {
    // No prior file to rotate — first write.
  }
  await Filesystem.writeFile({
    path: DB_FILE,
    data: toBase64(bytes),
    directory: Directory.Data,
  });
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
