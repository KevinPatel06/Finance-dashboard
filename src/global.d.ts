import type { Api } from '../electron/preload';

declare global {
  interface Window {
    api: Api;
  }
  /** Injected by Vite's `define` — which build target this bundle is for. */
  const __PLATFORM__: 'electron' | 'ios';
}

export {};
