import { LocalNotifications } from '@capacitor/local-notifications';
import * as repo from '../../../core/repo';
import { buildNotes, todayStr } from '../../../core/notifications';
import { flush } from './storage';

/**
 * iOS delivery for the reminders computed in core/notifications.ts.
 * Same once-per-day contract as the desktop scheduler.
 */
export async function runNotificationCheck(): Promise<void> {
  try {
    const settings = repo.getSettings();
    if (!settings.notify_enabled) return;

    const today = todayStr();
    if (repo.getMeta('last_notified_date') === today) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }

    const notes = buildNotes();
    // Always stamp the day, even with nothing to say, so we check once daily.
    repo.setMeta('last_notified_date', today);
    await flush();

    if (notes.length === 0) return;

    await LocalNotifications.schedule({
      notifications: notes.map((n, i) => ({
        id: Math.floor(Date.now() % 100000) + i,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(Date.now() + 2000 + i * 500) },
      })),
    });
  } catch (err) {
    console.error('Notification check failed:', err);
  }
}
