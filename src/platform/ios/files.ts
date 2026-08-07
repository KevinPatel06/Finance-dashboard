import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { readDbBase64 } from './storage';

/** Write a CSV to the app's cache directory and open the iOS share sheet. */
export async function exportCsv(
  defaultName: string,
  content: string
): Promise<{ ok: boolean; path?: string }> {
  try {
    // UTF-8 BOM so Excel reads accented characters, matching the desktop handler.
    const res = await Filesystem.writeFile({
      path: defaultName,
      data: '﻿' + content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: defaultName, url: res.uri });
    return { ok: true, path: res.uri };
  } catch {
    return { ok: false };
  }
}

/**
 * Share the live finance.db so it can be AirDropped to the desktop.
 * Both platforms use an identical schema and migration chain, so a file
 * exported here restores in the Windows app and vice versa.
 */
export async function backupDb(): Promise<{ ok: boolean; path?: string }> {
  try {
    const data = await readDbBase64();
    const name = `finance-backup-${new Date().toISOString().slice(0, 10)}.db`;
    const res = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: name, url: res.uri });
    return { ok: true, path: res.uri };
  } catch {
    return { ok: false };
  }
}
