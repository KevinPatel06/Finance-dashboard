import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase, closeDatabase } from './db';
import { registerIpcHandlers } from './ipc/handlers';
import { startNotificationScheduler, stopNotificationScheduler } from './notifications';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Stable user data location ----------
// Pin the userData folder to a fixed name so the product name in package.json
// can change without orphaning the user's database. This must happen BEFORE
// anything reads app.getPath('userData').
const STABLE_USER_DATA = path.join(app.getPath('appData'), 'Finance Dashboard');
app.setPath('userData', STABLE_USER_DATA);

// One-time migration: copy the database from the previous product-name folder
// if it exists and the new location is empty.
function migrateOldUserData() {
  try {
    const newDb = path.join(STABLE_USER_DATA, 'finance.db');
    if (fs.existsSync(newDb)) return; // already migrated or fresh install
    const oldPath = path.join(app.getPath('appData'), "Kevin's Finance Application");
    const oldDb = path.join(oldPath, 'finance.db');
    if (!fs.existsSync(oldDb)) return; // no prior install
    fs.mkdirSync(STABLE_USER_DATA, { recursive: true });
    fs.copyFileSync(oldDb, newDb);
    // Carry over the WAL / SHM sidecar files if they exist so we don't lose
    // any pending journal data.
    for (const ext of ['-wal', '-shm']) {
      const oldSide = oldDb + ext;
      if (fs.existsSync(oldSide)) {
        fs.copyFileSync(oldSide, newDb + ext);
      }
    }
  } catch (err) {
    console.error('User-data migration failed:', err);
  }
}

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

let win: BrowserWindow | null = null;

function createWindow() {
  // In dev the packaged exe icon isn't present, so point the window at the
  // source PNG when it exists (packaged builds inherit the embedded exe icon).
  const devIcon = path.join(process.env.APP_ROOT!, 'build', 'icon.png');

  win = new BrowserWindow({
    title: 'Finance Dashboard',
    icon: fs.existsSync(devIcon) ? devIcon : undefined,
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0b0d12',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Open external links in the user's browser, not a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(() => {
  migrateOldUserData();
  initDatabase();
  registerIpcHandlers();
  createWindow();
  startNotificationScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopNotificationScheduler();
  closeDatabase();
});
