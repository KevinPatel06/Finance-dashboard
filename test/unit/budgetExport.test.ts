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

describe('registered accounts in the export', () => {
  const registered = [
    { label: 'TFSA', taxYear: 2026, room: 19500, goal: 7000, deadline: '2026-12-31', contributed: 6400, monthly: 600 },
    { label: 'RRSP', taxYear: 2026, room: 14200, goal: null, deadline: '2027-03-01', contributed: 3950, monthly: null },
  ];

  it('lists each account with its year, room, goal and monthly plan', () => {
    const md = buildBudgetMarkdown({ ...base, registered });
    expect(md).toContain('## Registered accounts');
    expect(md).toContain('| TFSA | 2026 | $19,500.00 | $7,000.00 | 2026-12-31 | $6,400.00 | $600.00 |');
    expect(md).toContain('| RRSP | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | Not budgeted |');
  });

  it('says why an account has no monthly amount', () => {
    const md = buildBudgetMarkdown({
      ...base,
      registered: [
        { ...registered[1], label: 'A', status: 'goal_met' as const },
        { ...registered[1], label: 'B', status: 'no_goal' as const },
        { ...registered[1], label: 'C', status: 'past_deadline' as const },
        { ...registered[1], label: 'D', status: 'not_budgeted' as const },
      ],
    });
    expect(md).toContain('| A | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | Goal met |');
    expect(md).toContain('| B | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | No goal set |');
    expect(md).toContain('| C | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | Deadline passed |');
    expect(md).toContain('| D | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | Not budgeted |');
  });

  it('takes planned contributions off the top in the summary', () => {
    const md = buildBudgetMarkdown({ ...base, registered });
    expect(md).toContain('| Planned registered contributions | $600.00 |');
    expect(md).toContain('| Left for funds and spending |');
  });

  it('says None when there are no accounts', () => {
    expect(buildBudgetMarkdown({ ...base, registered: [] })).toContain('## Registered accounts\n\n_None_');
  });
});
