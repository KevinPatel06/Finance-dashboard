// Minimal stand-in so Node-side tests can import modules that pull in `electron`
// at module scope. Tests never call initDatabase(); they inject via setDb().
import os from 'node:os';

export const app = {
  getPath: (_name: string) => os.tmpdir(),
  setPath: (_name: string, _p: string) => {},
  relaunch: () => {},
  exit: (_code: number) => {},
};
export const ipcMain = { handle: (_c: string, _h: unknown) => {} };
export const dialog = {};
export const contextBridge = { exposeInMainWorld: (_k: string, _v: unknown) => {} };
export const ipcRenderer = { invoke: async () => undefined };
export const Notification = class {
  static isSupported() {
    return false;
  }
  show() {}
};
