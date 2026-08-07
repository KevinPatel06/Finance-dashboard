import { ipcMain, dialog, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../../shared/ipc';
import { getRawDb, getDbPath } from '../db';
import { REPO_API } from '../../core/apiMap';

export function registerIpcHandlers() {
  // Every repo-backed channel comes from the shared map, so Electron and iOS
  // can never drift apart. Platform services stay hand-written below.
  for (const { channel, fn } of REPO_API) {
    ipcMain.handle(channel, (_e, ...args) => fn(...args));
  }

  // ---------- DB backup/restore ----------
  ipcMain.handle(IPC.DB_BACKUP, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup Finance Database',
      defaultPath: `finance-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite DB', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { ok: false };
    const db = getRawDb();
    await db.backup(filePath);
    return { ok: true, path: filePath };
  });

  ipcMain.handle(IPC.DB_RESTORE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore Finance Database',
      filters: [{ name: 'SQLite DB', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    const src = filePaths[0];
    const dest = getDbPath();
    // Copy file then signal renderer to reload — the app must be restarted to re-init DB.
    fs.copyFileSync(src, dest);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  // ---------- File export ----------
  ipcMain.handle(IPC.EXPORT_CSV, async (_e, defaultName: string, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: defaultName,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false };
    // Prepend a UTF-8 BOM so Excel reads accented characters correctly.
    fs.writeFileSync(filePath, '﻿' + content, 'utf8');
    return { ok: true, path: filePath };
  });
}
