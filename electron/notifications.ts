import { Notification } from 'electron';
import * as repo from '../core/repo';

// ---------------------------------------------------------------------------
// Desktop reminders. On launch (and once a day after) we check for overdue /
// soon-due bills, an arriving paycheck, and over-budget categories, then fire
// native OS notifications. Deduped to once per calendar day via a `settings`
// bookkeeping key so reopening the app doesn't re-nag.
// ---------------------------------------------------------------------------

const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(iso: string): number {
  const ms = new Date(iso + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime();
  return Math.round(ms / 86_400_000);
}

interface Note {
  title: string;
  body: string;
}

function buildNotes(): Note[] {
  const s = repo.getSettings();
  if (!s.notify_enabled) return [];
  const notes: Note[] = [];

  // ---- Bills ----
  const statuses = repo.billStatuses();
  const overdue = statuses.filter((b) => b.status === 'overdue');
  if (overdue.length > 0) {
    const amount = overdue.reduce((a, b) => a + b.overdueAmount, 0);
    notes.push({
      title: `${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}`,
      body: `${money.format(amount)} past due. Open Finance Dashboard to catch up.`,
    });
  }
  const lead = s.notify_bill_lead_days;
  const dueSoon = statuses.filter((b) => {
    if (b.status !== 'due_soon' || !b.nextDueDate) return false;
    const d = daysUntil(b.nextDueDate);
    return d >= 0 && d <= lead;
  });
  if (dueSoon.length > 0) {
    const names = dueSoon.map((b) => b.bill.name).slice(0, 3).join(', ');
    notes.push({
      title: `${dueSoon.length} bill${dueSoon.length > 1 ? 's' : ''} due soon`,
      body: `${names}${dueSoon.length > 3 ? '…' : ''} due within ${lead} day${lead > 1 ? 's' : ''}.`,
    });
  }

  // ---- Paycheck ----
  if (s.notify_paycheck && s.next_paycheck_date) {
    const d = daysUntil(s.next_paycheck_date);
    if (d === 0) notes.push({ title: 'Payday!', body: 'Your paycheck is due today — log it when it lands.' });
    else if (d === 1) notes.push({ title: 'Paycheck tomorrow', body: 'Your next paycheck arrives tomorrow.' });
  }

  // ---- Budgets ----
  if (s.notify_budget) {
    const over = repo
      .listExpenseBudgets()
      .filter((b) => b.monthly_limit > 0 && b.spent >= b.monthly_limit);
    if (over.length > 0) {
      const names = over.map((b) => b.name).slice(0, 3).join(', ');
      notes.push({
        title: `Over budget: ${over.length} categor${over.length > 1 ? 'ies' : 'y'}`,
        body: `${names} exceeded the monthly cap.`,
      });
    }
  }

  return notes;
}

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
