import type { AppSettings } from '../../shared/types';

/**
 * On Electron, window.api is installed by the preload script before any
 * renderer code runs, so there is nothing to do. On iOS there is no preload —
 * the API is built in-process and must be ready before React renders.
 */
export async function bootstrapPlatform(): Promise<void> {
  if (__PLATFORM__ !== 'ios') return;
  const { installIosApi } = await import('./ios/api');
  await installIosApi();
}

export type HapticKind = 'tap' | 'select' | 'success' | 'warning';

let hapticsModule: Promise<typeof import('./ios/haptics')> | null = null;

/**
 * A light buzz on the iPhone (tap = press, select = toggle, success/warning =
 * a save or an error). No-op on Electron; the branch is compiled out there.
 */
export function haptic(kind: HapticKind): void {
  if (__PLATFORM__ !== 'ios') return;
  hapticsModule ??= import('./ios/haptics');
  void hapticsModule.then((m) => m.haptic(kind)).catch(() => {});
}

/**
 * (Re)schedules the phone's repeating reminders (daily log, new month, weekly
 * report). No-op on Electron — the desktop has its own once-a-day scheduler.
 */
export async function scheduleReminders(settings: AppSettings): Promise<void> {
  if (__PLATFORM__ !== 'ios') return;
  const { scheduleReminders: schedule } = await import('./ios/notify');
  await schedule(settings);
}
