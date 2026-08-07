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

/**
 * Flush the in-memory DB to disk, rotating one backup first.
 *
 * The DB lives in memory, so this is what makes writes durable. Called after
 * every mutating API call and when iOS backgrounds the app.
 */
export async function flush(): Promise<void> {
  if (!handle) return;
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

/** Read the live database file as base64 — used by backup/share. */
export async function readDbBase64(): Promise<string> {
  const res = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
  return res.data as string;
}
