import { addMonths, format, formatISO, parseISO } from 'date-fns';

/** Today's LOCAL date as YYYY-MM-DD (never UTC — evenings in Canada are tomorrow in UTC). */
export const todayIso = () => formatISO(new Date(), { representation: 'date' });

export const currentMonth = () => todayIso().slice(0, 7);

/** 'October 2026' */
export const monthLabel = (month: string) => format(parseISO(`${month}-01`), 'MMMM yyyy');

/** 'October' */
export const monthName = (month: string) => format(parseISO(`${month}-01`), 'MMMM');

export const shiftMonth = (month: string, n: number) =>
  formatISO(addMonths(parseISO(`${month}-01`), n), { representation: 'date' }).slice(0, 7);

/** 'November 1' — the day the next budget starts. */
export const nextBudgetLabel = (month: string) => format(parseISO(`${shiftMonth(month, 1)}-01`), 'MMMM d');

/** 'Oct 6' */
export const shortDate = (iso: string) => format(parseISO(iso), 'MMM d');

/** 'Today' / 'Yesterday' / 'Oct 6' */
export function friendlyDate(iso: string): string {
  const t = todayIso();
  if (iso === t) return 'Today';
  const y = formatISO(new Date(Date.now() - 86_400_000), { representation: 'date' });
  if (iso === y) return 'Yesterday';
  return shortDate(iso);
}
