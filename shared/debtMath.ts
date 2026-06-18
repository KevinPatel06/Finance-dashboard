import type { DebtCompounding, DebtFrequency } from './types';

/**
 * Pure interest-rate helpers shared by the renderer (src/lib/debtMath.ts) and
 * the main process (electron/db/repo.ts). Kept dependency-free so it imports
 * cleanly from both build targets.
 */

export const PERIODS_PER_YEAR: Record<DebtFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semi_monthly: 24,
  monthly: 12,
};

/**
 * Effective interest rate per payment period.
 * - 'monthly': US-style nominal rate — APR divided across the year's periods.
 * - 'semi_annual': Canadian fixed-mortgage convention — APR compounded
 *   semi-annually, not in advance: (1 + APR/2)^(2/periodsPerYear) − 1.
 */
export function periodRate(
  annualRatePct: number,
  frequency: DebtFrequency,
  compounding: DebtCompounding
): number {
  const ppy = PERIODS_PER_YEAR[frequency];
  const apr = annualRatePct / 100;
  if (compounding === 'semi_annual') return Math.pow(1 + apr / 2, 2 / ppy) - 1;
  return apr / ppy;
}
