import { addDays, addMonths, differenceInCalendarDays, formatISO, getDaysInMonth, parseISO } from 'date-fns';
import type { PayFrequency } from './types';

/**
 * Payday arithmetic for the monthly budget. Pure: callers pass dates in, so
 * "today" is always the caller's LOCAL date rather than UTC.
 *
 * A month is planned on the paychecks it is guaranteed to get (two for
 * biweekly). Any payday beyond that count is a bonus — always the last ones in
 * the month, since the guaranteed ones are by definition the earlier ones.
 */

const iso = (d: Date) => formatISO(d, { representation: 'date' });

export interface MonthPayday {
  date: string;
  kind: 'regular' | 'bonus';
}

/** Paychecks every calendar month is guaranteed to contain. */
export function guaranteedPerMonth(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly':
      return 4;
    case 'biweekly':
    case 'semi_monthly':
      return 2;
    case 'monthly':
      return 1;
  }
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** First day, last day and length of a 'YYYY-MM' month. */
export function monthBounds(month: string): { start: string; end: string; days: number } {
  const start = parseISO(`${month}-01`);
  const days = getDaysInMonth(start);
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

/** Shift a 'YYYY-MM' month by `n` months (negative goes back). */
export function addMonthsToMonth(month: string, n: number): string {
  return iso(addMonths(parseISO(`${month}-01`), n)).slice(0, 7);
}

/** The given day of `month`, clamped to the month's length. */
function dayInMonth(month: string, day: number): string {
  const { days } = monthBounds(month);
  return `${month}-${String(Math.min(day, days)).padStart(2, '0')}`;
}

function stepDays(freq: PayFrequency): number | null {
  if (freq === 'weekly') return 7;
  if (freq === 'biweekly') return 14;
  return null;
}

/** Raw payday dates falling inside `month`, ascending. */
function paydayDatesInMonth(anchor: string, freq: PayFrequency, month: string): string[] {
  const { start, end } = monthBounds(month);
  const step = stepDays(freq);
  if (step) {
    const a = parseISO(anchor);
    const k = Math.ceil(differenceInCalendarDays(parseISO(start), a) / step);
    const out: string[] = [];
    for (let d = addDays(a, k * step); iso(d) <= end; d = addDays(d, step)) out.push(iso(d));
    return out;
  }
  if (freq === 'monthly') {
    // An anchor on its month's last day means "month-end": confirming a payday
    // rolls the anchor forward, and a 31st payer stored as Nov 30 must still
    // land on Dec 31, not drift to the 30th for good.
    const a = parseISO(anchor);
    const monthEnd = a.getDate() === getDaysInMonth(a);
    return [dayInMonth(month, monthEnd ? 31 : a.getDate())];
  }
  // semi_monthly: the 15th and the last day of the month.
  return [`${month}-15`, end];
}

/** Every payday in `month`, each marked regular or bonus. */
export function paydaysInMonth(anchor: string, freq: PayFrequency, month: string): MonthPayday[] {
  const guaranteed = guaranteedPerMonth(freq);
  return paydayDatesInMonth(anchor, freq, month).map((date, i) => ({
    date,
    kind: i < guaranteed ? 'regular' : 'bonus',
  }));
}

/** The first payday strictly after `after`. */
export function nextPaydayAfter(anchor: string, freq: PayFrequency, after: string): string {
  let month = monthOf(after);
  for (let guard = 0; guard < 24; guard++, month = addMonthsToMonth(month, 1)) {
    const next = paydayDatesInMonth(anchor, freq, month).find((d) => d > after);
    if (next) return next;
  }
  throw new Error('No payday found within two years');
}
