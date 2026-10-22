import { describe, it, expect } from 'vitest';
import { buildBudgetMarkdown, monthlyEquivalent, type BudgetExportInput } from '../../shared/budgetExport';
import type { Debt, SavingsGoal } from '../../shared/types';

const visa: Debt = {
  id: 1,
  name: 'Visa',
  type: 'credit_card',
  original_amount: 0,
  current_balance: 1000,
  interest_rate: 19.99,
  payment_amount: 100,
  payment_frequency: 'monthly',
  split_count: 1,
  interest_day: 15,
  last_interest_applied: null,
  compounding: 'monthly',
  notes: null,
  archived: 0,
  created_at: '2026-01-01',
};

const laptop = {
  id: 1,
  name: 'New laptop',
  target_amount: 1800,
  target_date: '2027-04-22',
  color: '#8b5cf6',
  archived: 0,
  archived_at: null,
  created_at: '2026-01-01',
  current_amount: 600,
  emoji: '💻',
} as SavingsGoal;

const base: BudgetExportInput = {
  userName: 'Kevin',
  today: '2026-10-22',
  pay: { amount: 1200, frequency: 'biweekly' },
  recurring: [
    { description: 'Rent', amount: 1450, frequency: 'monthly', interval_count: 1 },
    { description: 'Car insurance', amount: 1300, frequency: 'monthly', interval_count: 6 },
  ],
  debts: [visa],
  funds: [laptop],
  categories: [
    { name: 'Groceries', kind: 'need', avgMonthly: 310.5 },
    { name: 'Entertainment', kind: 'want', avgMonthly: 0 },
  ],
};

describe('monthlyEquivalent', () => {
  it('normalises every schedule to a monthly amount', () => {
    expect(monthlyEquivalent({ amount: 1300, frequency: 'monthly', interval_count: 6 })).toBeCloseTo(216.67, 2);
    expect(monthlyEquivalent({ amount: 100, frequency: 'biweekly', interval_count: 1 })).toBeCloseTo(216.67, 2);
    expect(monthlyEquivalent({ amount: 120, frequency: 'yearly', interval_count: 1 })).toBeCloseTo(10, 6);
    expect(monthlyEquivalent({ amount: 20, frequency: 'weekly', interval_count: 2 })).toBeCloseTo(43.33, 2);
  });
});

describe('buildBudgetMarkdown', () => {
  const md = buildBudgetMarkdown(base);

  it('states the pay and the planned monthly income', () => {
    expect(md).toContain('every 2 weeks');
    expect(md).toContain('$1,200.00');
    expect(md).toContain('$2,400.00');
  });

  it('has a section for each kind of data', () => {
    for (const h of ['## Income', '## Recurring expenses', '## Debts', '## Savings goals', '## Spending categories']) {
      expect(md).toContain(h);
    }
  });

  it('estimates monthly interest using the debt’s compounding', () => {
    expect(md).toContain('$16.66');
  });

  it('works out what each savings goal needs per month', () => {
    // $1,200 still to go over 6 months.
    expect(md).toContain('$200.00');
  });

  it('asks for a reply the user can copy back in', () => {
    expect(md).toContain('Category | Need/Want | Monthly amount');
  });

  it('says so when a section is empty', () => {
    const empty = buildBudgetMarkdown({ ...base, debts: [], funds: [] });
    expect(empty.match(/_None_/g)?.length).toBe(2);
  });

  it('copes with pay not being set', () => {
    expect(() => buildBudgetMarkdown({ ...base, pay: { amount: null, frequency: 'biweekly' } })).not.toThrow();
  });
});
