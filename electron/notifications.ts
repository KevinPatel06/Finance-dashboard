import { Notification } from 'electron';
import * as repo from '../core/repo';
import { buildNotes, todayStr } from '../core/notifications';

// ---------------------------------------------------------------------------
// Desktop delivery for the reminders computed in core/notifications.ts.
// Deduped to once per calendar day via a `settings` bookkeeping key so
// reopening the app doesn't re-nag.
// ---------------------------------------------------------------------------

function fire() {
  try {
    if (!Notification.isSupported()) return;
    const today = todayStr();
    if (repo.getMeta('last_notified_date') === today) return;
    const notes = buildNotes();
    // Always stamp the day, even with nothing to say, so we check once daily.
    repo.setMeta('last_notified_date', today);
    for (const n of notes) {
      new Notification({ title: n.title, body: n.body }).show();
    }
  } catch (err) {
    console.error('Notification check failed:', err);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler() {
  // Give the window a moment to appear before the first check.
  setTimeout(fire, 8_000);
  // Re-check every 6 hours; the once-a-day guard keeps it from repeating.
  timer = setInterval(fire, 6 * 60 * 60 * 1000);
}

export function stopNotificationScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
