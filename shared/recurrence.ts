import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, formatISO, parseISO } from 'date-fns';
import type { RecurringFrequency } from './types';

/**
 * Occurrence math for recurring templates ("every N weeks/months/years").
 *
 * Occurrence n is always computed FROM THE ANCHOR, never by stepping from the
 * previous occurrence: stepping a Jan 31 bill by one month lands on Feb 28 and
 * then stays on the 28th forever. Computing anchor + n months keeps it on the
 * 31st whenever the month has one.
 */

const iso = (d: Date) => formatISO(d, { representation: 'date' });

/** Rough period length in days — only used to jump near the right index. */
function approxPeriodDays(freq: RecurringFrequency, interval: number): number {
  const n = Math.max(1, interval);
  switch (freq) {
    case 'weekly':
      return 7 * n;
    case 'biweekly':
      return 14 * n;
    case 'monthly':
      return 30.436875 * n;
    case 'yearly':
      return 365.2425 * n;
  }
}

/** The anchor plus `n` periods, as YYYY-MM-DD. n = 0 is the anchor itself. */
export function nthOccurrence(
  anchor: string,
  freq: RecurringFrequency,
  interval: number,
  n: number
): string {
  const a = parseISO(anchor);
  const steps = n * Math.max(1, interval);
  switch (freq) {
    case 'weekly':
      return iso(addWeeks(a, steps));
    case 'biweekly':
      return iso(addDays(a, 14 * steps));
    case 'monthly':
      return iso(addMonths(a, steps));
    case 'yearly':
      return iso(addYears(a, steps));
  }
}

/** Index of the first occurrence that could be on or after `date` (may undershoot). */
function startIndex(anchor: string, freq: RecurringFrequency, interval: number, date: string): number {
  const days = differenceInCalendarDays(parseISO(date), parseISO(anchor));
  if (days <= 0) return 0;
  return Math.max(0, Math.floor(days / approxPeriodDays(freq, interval)) - 2);
}

/** Every occurrence in [from, to], inclusive and ascending. Never before the anchor. */
export function occurrencesInRange(
  anchor: string,
  freq: RecurringFrequency,
  interval: number,
  from: string,
  to: string
): string[] {
  const out: string[] = [];
  let n = startIndex(anchor, freq, interval, from);
  for (let guard = 0; guard < 2000; guard++, n++) {
    const d = nthOccurrence(anchor, freq, interval, n);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** The last occurrence on or before `date`, or null if the series hasn't started. */
export function latestOccurrenceOnOrBefore(
  anchor: string,
  freq: RecurringFrequency,
  interval: number,
  date: string
): string | null {
  if (date < anchor) return null;
  let n = startIndex(anchor, freq, interval, date);
  let last: string | null = null;
  for (let guard = 0; guard < 2000; guard++, n++) {
    const d = nthOccurrence(anchor, freq, interval, n);
    if (d > date) break;
    last = d;
  }
  return last;
}
