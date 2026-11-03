import type { AppSettings } from '../../shared/types';

/**
 * On Electron, window.api is installed by the preload script before any
 * renderer code runs, so there is nothing to do. On the phone (iOS and Android) there is no preload —
 * the API is built in-process and must be ready before React renders.
 */
export async function bootstrapPlatform(): Promise<void> {
  if (__PLATFORM__ !== 'mobile') return;
  const { installMobileApi } = await import('./mobile/api');
  await installMobileApi();
}

export type HapticKind = 'tap' | 'select' | 'success' | 'warning';

let hapticsModule: Promise<typeof import('./mobile/haptics')> | null = null;

/**
 * A light buzz on the phone (tap = press, select = toggle, success/warning =
 * a save or an error). No-op on Electron; the branch is compiled out there.
 */
export function haptic(kind: HapticKind): void {
  if (__PLATFORM__ !== 'mobile') return;
  hapticsModule ??= import('./mobile/haptics');
  void hapticsModule.then((m) => m.haptic(kind)).catch(() => {});
}

/**
 * Android back button. Sheets and dialogs close first (`lib/backStack`);
 * otherwise `fallback` runs — return 'minimize' to background the app.
 * No-op on Electron and iOS. Returns an unsubscribe.
 */
export function onAndroidBack(fallback: () => 'minimize' | void): () => void {
  if (__PLATFORM__ !== 'mobile') return () => {};
  let off: (() => void) | null = null;
  let cancelled = false;
  void import('./mobile/androidBack').then((m) => {
    if (!cancelled) off = m.listenForBack(fallback);
  });
  return () => {
    cancelled = true;
    off?.();
  };
}

/**
 * (Re)schedules the phone's repeating reminders (daily log, new month, weekly
 * report). No-op on Electron — the desktop has its own once-a-day scheduler.
 */
export async function scheduleReminders(settings: AppSettings): Promise<void> {
  if (__PLATFORM__ !== 'mobile') return;
  const { scheduleReminders: schedule } = await import('./mobile/notify');
  await schedule(settings);
}
