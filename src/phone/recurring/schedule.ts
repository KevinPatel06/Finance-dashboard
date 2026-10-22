import { addYears, format, formatISO, parseISO } from 'date-fns';
import type { RecurringExpense } from '@shared/types';
import { occurrencesInRange } from '@shared/recurrence';
import { ordinal } from '@/lib/debtMath';
import { todayIso } from '../dates';

/** The next occurrence on or after today, or null if it never recurs again. */
export function nextOccurrence(r: Pick<RecurringExpense, 'anchor_date' | 'frequency' | 'interval_count'>): string | null {
  const today = todayIso();
  const until = formatISO(addYears(parseISO(today), 3), { representation: 'date' });
  return occurrencesInRange(r.anchor_date, r.frequency, r.interval_count, today, until)[0] ?? null;
}

/** Weeks per step for weekly-type schedules (biweekly is 2 weeks per step). */
export const weeksPerStep = (r: Pick<RecurringExpense, 'frequency' | 'interval_count'>) =>
  (r.frequency === 'biweekly' ? 2 : 1) * Math.max(1, r.interval_count);

/** "Every month · 1st", "Every week · Mon", "Every 6 months · next 15 Aug". */
export function scheduleLabel(r: RecurringExpense): string {
  const next = nextOccurrence(r);
  const n = Math.max(1, r.interval_count);
  if (!next) return 'Ended';
  const d = parseISO(next);
  switch (r.frequency) {
    case 'weekly':
    case 'biweekly': {
      const w = weeksPerStep(r);
      return w === 1 ? `Every week · ${format(d, 'EEE')}` : `Every ${w} weeks · next ${format(d, 'MMM d')}`;
    }
    case 'monthly':
      if (n === 1) return `Every month · ${ordinal(d.getDate())}`;
      return `${n === 6 ? 'Every half year' : n === 3 ? 'Every quarter' : `Every ${n} months`} · next ${format(d, 'd MMM')}`;
    case 'yearly':
      return `${n === 1 ? 'Every year' : `Every ${n} years`} · next ${format(d, 'MMM d')}`;
  }
}
