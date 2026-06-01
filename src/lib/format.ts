import { format, parseISO } from 'date-fns';

// Canadian dollar formatting. en-CA produces "$1,234.56" with the $ symbol,
// which is the local convention for CAD in Canada.
const currencyFmt = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyWholeFmt = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const fmtMoney = (n: number) => currencyFmt.format(n || 0);
export const fmtMoneyShort = (n: number) =>
  Math.abs(n) >= 1000 || !Number.isInteger(n) ? currencyFmt.format(n || 0) : currencyWholeFmt.format(n || 0);

export const fmtDate = (iso: string | null | undefined, pattern = 'MMM d, yyyy') => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
};

export const fmtDateShort = (iso: string | null | undefined) => fmtDate(iso, 'MMM d');
