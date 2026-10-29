import { LocalNotifications } from '@capacitor/local-notifications';
import * as repo from '../../../core/repo';
import { buildNotes, todayStr } from '../../../core/notifications';
import { flush } from './storage';
import type { AppSettings } from '../../../shared/types';

/**
 * One-off reminder ids start above the repeating reminders' fixed ids (9001–
 * 9003, below). Scheduling an id that's already pending replaces it, so an
 * overlap would silently cancel a repeating reminder.
 */
const ONE_OFF_BASE = 100_000;

let running: Promise<void> | null = null;

/**
 * iOS delivery for the reminders computed in core/notifications.ts.
 * Same once-per-day contract as the desktop scheduler. Runs at launch and on
 * every return to the foreground.
 *
 * Overlapping calls share one pass. They do overlap: the permission prompt
 * makes the app inactive and then active again, so the resume check starts
 * while the launch check is still waiting on it, and both would send the
 * day's reminders.
 */
export function runNotificationCheck(): Promise<void> {
  if (!running) {
    running = check().finally(() => {
      running = null;
    });
  }
  return running;
}

async function check(): Promise<void> {
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
        id: ONE_OFF_BASE + (Date.now() % 100_000) + i,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(Date.now() + 2000 + i * 500) },
      })),
    });
  } catch (err) {
    console.error('Notification check failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Repeating budget reminders. Unlike the once-a-day check above (which only
// runs when the app is opened), these are scheduled with iOS ahead of time so
// they fire with the app closed. Fixed ids let a settings change replace them.
// ---------------------------------------------------------------------------

const DAILY_LOG = 9001;
const NEW_MONTH = 9002;
const WEEKLY_REPORT = 9003;

export async function scheduleReminders(s: AppSettings): Promise<void> {
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_LOG }, { id: NEW_MONTH }, { id: WEEKLY_REPORT }],
    });
    if (!s.notify_enabled) return;
    const wanted = s.notify_daily_log || s.notify_new_month || s.notify_weekly_report;
    if (!wanted) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }

    const [hour, minute] = s.notify_daily_time.split(':').map(Number);
    const notifications = [];
    if (s.notify_daily_log) {
      notifications.push({
        id: DAILY_LOG,
        title: "Don't forget to log today's expenses 🌙",
        body: 'Tap + and type what you spent, like "coffee 5, lunch 12".',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      });
    }
    if (s.notify_new_month) {
      notifications.push({
        id: NEW_MONTH,
        title: 'New month, new budget 🗓️',
        body: "Review last month's plan and confirm this month's budget.",
        schedule: { on: { day: 1, hour: 9, minute: 0 }, allowWhileIdle: true },
      });
    }
    if (s.notify_weekly_report) {
      notifications.push({
        id: WEEKLY_REPORT,
        title: 'Your weekly report is ready 🗞️',
        body: 'See where your money went last week.',
        // Capacitor's Weekday enum: Sunday = 1, Monday = 2.
        schedule: { on: { weekday: 2, hour: 9, minute: 0 }, allowWhileIdle: true },
      });
    }
    await LocalNotifications.schedule({ notifications });
  } catch (err) {
    console.error('Scheduling reminders failed:', err);
  }
}
