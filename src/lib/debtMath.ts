import { addDays, addMonths } from 'date-fns';
import type { Debt, DebtCompounding, DebtFrequency } from '@shared/types';
import { PERIODS_PER_YEAR, periodRate } from '@shared/debtMath';

// Re-exported so existing renderer call-sites keep their `@/lib/debtMath` imports.
export { PERIODS_PER_YEAR, periodRate };

export const FREQ_LABEL: Record<DebtFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  semi_monthly: 'Semi-monthly',
  monthly: 'Monthly',
};

export interface PayoffEstimate {
  /** Payment never covers interest — balance grows forever. */
  neverPaysOff: boolean;
  /** Number of payment periods to reach zero (ceil). */
  periods: number;
  /** Same, expressed in months for display. */
  months: number;
  /** Projected payoff date from today. */
  payoffDate: Date;
  /** Total interest paid over the payoff. */
  totalInterest: number;
}

/**
 * Standard amortization estimate. `payment` is the full payment per cycle
 * (splitting only changes the user's share, not how fast the loan dies).
 */
export function estimatePayoff(
  balance: number,
  annualRatePct: number,
  payment: number,
  frequency: DebtFrequency,
  compounding: DebtCompounding = 'monthly'
): PayoffEstimate | null {
  if (balance <= 0 || payment <= 0) return null;
  const periodsPerYear = PERIODS_PER_YEAR[frequency];
  const r = periodRate(annualRatePct, frequency, compounding);

  if (r === 0) {
    const periods = Math.ceil(balance / payment);
    return {
      neverPaysOff: false,
      periods,
      months: Math.ceil((periods / periodsPerYear) * 12),
      payoffDate: addDays(new Date(), Math.ceil((periods / periodsPerYear) * 365.25)),
      totalInterest: 0,
    };
  }

  if (payment <= balance * r) {
    return {
      neverPaysOff: true,
      periods: Infinity,
      months: Infinity,
      payoffDate: new Date(8640000000000000),
      totalInterest: Infinity,
    };
  }

  const periods = Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
  const totalPaid = periods * payment;
  return {
    neverPaysOff: false,
    periods,
    months: Math.ceil((periods / periodsPerYear) * 12),
    payoffDate: addDays(new Date(), Math.ceil((periods / periodsPerYear) * 365.25)),
    totalInterest: Math.max(0, totalPaid - balance),
  };
}

export interface BalancePoint {
  month: number; // months from now
  base: number | null;
  extra: number | null;
}

/**
 * Balance-over-time series for the what-if chart: base payment vs payment+extra.
 * Sampled monthly. Caps at 40 years to avoid runaway loops.
 */
export function payoffSeries(
  balance: number,
  annualRatePct: number,
  payment: number,
  extra: number,
  frequency: DebtFrequency,
  compounding: DebtCompounding = 'monthly'
): BalancePoint[] {
  const periodsPerYear = PERIODS_PER_YEAR[frequency];
  const r = periodRate(annualRatePct, frequency, compounding);
  const maxPeriods = periodsPerYear * 40;

  const simulate = (pmt: number): number[] => {
    // Balance snapshot after each period.
    const out: number[] = [balance];
    let b = balance;
    if (pmt <= 0 || (r > 0 && pmt <= b * r)) return out; // would never decline
    let i = 0;
    while (b > 0 && i < maxPeriods) {
      b = b * (1 + r) - pmt;
      out.push(Math.max(0, b));
      i++;
    }
    return out;
  };

  const base = simulate(payment);
  const withExtra = extra > 0 ? simulate(payment + extra) : null;

  // Convert period snapshots into monthly samples for a clean x-axis.
  const periodsToMonths = (idx: number) => (idx / periodsPerYear) * 12;
  const totalMonths = Math.ceil(periodsToMonths(base.length - 1));
  const points: BalancePoint[] = [];
  const sampleAtMonth = (series: number[] | null, m: number): number | null => {
    if (!series) return null;
    const idx = Math.round((m / 12) * periodsPerYear);
    if (idx >= series.length) return 0;
    return series[idx];
  };
  // Sample at most ~60 points so long mortgages stay readable.
  const stepM = Math.max(1, Math.ceil(totalMonths / 60));
  for (let m = 0; m <= totalMonths; m += stepM) {
    points.push({ month: m, base: sampleAtMonth(base, m), extra: sampleAtMonth(withExtra, m) });
  }
  return points;
}

/** Per-cycle interest charge at the current balance (what interest "costs" right now). */
export function interestPerCycle(debt: Debt): number {
  const r = periodRate(debt.interest_rate, debt.payment_frequency, debt.compounding);
  return debt.current_balance * r;
}

/** Monthly interest cost at current balance, honouring the debt's compounding convention. */
export function interestPerMonth(debt: Debt): number {
  return debt.current_balance * periodRate(debt.interest_rate, 'monthly', debt.compounding);
}

/** Next date (today or later) that interest hits, for a given day-of-month. */
export function nextInterestHit(day: number): Date {
  const now = new Date();
  const clamp = (base: Date) =>
    new Date(
      base.getFullYear(),
      base.getMonth(),
      Math.min(day, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate())
    );
  const thisMonth = clamp(now);
  if (thisMonth >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return thisMonth;
  return clamp(addMonths(now, 1));
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function fmtMonths(months: number): string {
  if (!Number.isFinite(months)) return '—';
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}
