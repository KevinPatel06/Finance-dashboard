import { fmtMoney } from '@/lib/format';

export const money = fmtMoney;

const whole = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

/** "$2,261" — hero numbers, where cents are noise. */
export const moneyWhole = (n: number) => whole.format(Math.round(n || 0));

/** "$31", "$1.5k" — calendar cells. */
export function moneyCompact(n: number): string {
  const v = Math.abs(n);
  if (v >= 10_000) return `$${Math.round(v / 1000)}k`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(v)}`;
}

/** "76%" of `part` out of `whole`, clamped to 0–100. */
export const pct = (part: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (part / total) * 100)) : 0;
