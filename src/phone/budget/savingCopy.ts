import type { BudgetMonthView } from '@shared/types';
import { monthName } from '../dates';
import { moneyWhole } from '../format';

/**
 * The words on the Saving tab's gauge button and the deposit banner. Kept
 * pure so the copy Kevin picked (mockup 3, option 2 "who's still due") is
 * pinned by tests, and every line stays short enough for one line on a phone.
 */

type SavingView = Pick<BudgetMonthView, 'status' | 'month' | 'planned' | 'saving' | 'lines'>;

/** "RRSP", "RRSP and FHSA", "RRSP, TFSA and FHSA". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function savingButton(v: SavingView): { line1: string; line2: string; done: boolean } {
  const { saving } = v;
  if (saving.planned <= 0) return { line1: 'Nothing planned yet', line2: 'Add a fund or an account', done: false };
  if (v.status !== 'confirmed') {
    return { line1: `${moneyWhole(saving.planned)} planned`, line2: 'Counts once you confirm', done: false };
  }
  if (v.lines.contribution.length === 0) {
    const names = v.lines.fund.map((f) => f.name);
    return {
      line1: `${moneyWhole(v.planned.fund)} into funds`,
      line2: names.length <= 2 ? joinNames(names) : `${names.length} funds`,
      done: false,
    };
  }
  if (saving.leftToDeposit > 0) {
    return { line1: `${moneyWhole(saving.leftToDeposit)} left to deposit`, line2: joinNames(saving.due), done: false };
  }
  return { line1: 'All deposited', line2: `${moneyWhole(saving.putAway)} put away in ${monthName(v.month)}`, done: true };
}

/** The Budget home's nudge while a confirmed month still has deposits to make. */
export function depositBanner(v: SavingView): { title: string; body: string } | null {
  if (v.status !== 'confirmed' || v.saving.leftToDeposit <= 0) return null;
  const due = v.lines.contribution.filter((l) => l.left > 0).map((l) => `${l.label} ${moneyWhole(l.left)}`);
  return {
    title: `Deposit ${moneyWhole(v.saving.leftToDeposit)} this month`,
    body: `${due.join(' · ')}. It's already set aside in your plan. Log each one once it's in the account.`,
  };
}
