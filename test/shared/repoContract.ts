import { describe, it, expect, beforeEach } from 'vitest';
import type { Bill } from '../../shared/types';
import { formatISO, subMonths } from 'date-fns';
import { periodRate } from '../../shared/debtMath';
import { occurrencesInRange } from '../../shared/recurrence';
import { getDb } from '../../core/db';
import * as repo from '../../core/repo';

function mkBill(partial: Partial<Bill>): Bill {
  return {
    id: 1,
    name: 'Test',
    amount: 100,
    frequency: 'monthly',
    custom_days: null,
    anchor_date: '2026-01-15',
    category_id: null,
    autopay: 0,
    notes: null,
    archived: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as Bill;
}

/**
 * Driver-agnostic behavioural contract for the repo layer.
 * Run once per SQLite driver; both must agree exactly.
 */
export function runRepoContract(
  label: string,
  makeDb: () => unknown,
  setDb: (db: unknown) => void
): void {
  describe(`repo contract [${label}]`, () => {
    beforeEach(() => {
      setDb(makeDb());
    });

    // ---------- Pure math (no DB) ----------

    it('converts every bill frequency to its biweekly equivalent', () => {
      expect(repo.billPerBiweekly(mkBill({ frequency: 'biweekly', amount: 100 }))).toBeCloseTo(
        100,
        10
      );
      expect(repo.billPerBiweekly(mkBill({ frequency: 'monthly', amount: 260 }))).toBeCloseTo(
        120,
        10
      );
      expect(
        repo.billPerBiweekly(mkBill({ frequency: 'semi_annual', amount: 1300 }))
      ).toBeCloseTo(100, 10);
      expect(repo.billPerBiweekly(mkBill({ frequency: 'yearly', amount: 2600 }))).toBeCloseTo(
        100,
        10
      );
      expect(
        repo.billPerBiweekly(mkBill({ frequency: 'custom_days', custom_days: 7, amount: 50 }))
      ).toBeCloseTo(100, 10);
    });

    it('returns the anchor date when it is already on or after `from`', () => {
      const bill = mkBill({ frequency: 'monthly', anchor_date: '2026-01-15' });
      const due = repo.nextDueOnOrAfter(bill, new Date('2026-01-01T00:00:00'));
      expect(due.getFullYear()).toBe(2026);
      expect(due.getMonth()).toBe(0);
      expect(due.getDate()).toBe(15);
    });

    it('rolls a monthly bill forward past `from`', () => {
      const bill = mkBill({ frequency: 'monthly', anchor_date: '2026-01-15' });
      const due = repo.nextDueOnOrAfter(bill, new Date('2026-03-20T00:00:00'));
      expect(due.getMonth()).toBe(3); // April
      expect(due.getDate()).toBe(15);
    });

    it('rolls a biweekly bill forward in whole 14-day steps', () => {
      const bill = mkBill({ frequency: 'biweekly', anchor_date: '2026-01-01' });
      const due = repo.nextDueOnOrAfter(bill, new Date('2026-01-20T00:00:00'));
      expect(due.getMonth()).toBe(0);
      expect(due.getDate()).toBe(29);
    });

    it('enumerates every monthly occurrence in a window inclusively', () => {
      const bill = mkBill({ frequency: 'monthly', anchor_date: '2026-01-15' });
      const occ = repo.occurrencesBetween(
        bill,
        new Date('2026-01-01T00:00:00'),
        new Date('2026-04-30T00:00:00')
      );
      expect(occ.map((d) => `${d.getMonth() + 1}-${d.getDate()}`)).toEqual([
        '1-15',
        '2-15',
        '3-15',
        '4-15',
      ]);
    });

    it('applies the Canadian semi-annual convention only when asked', () => {
      expect(periodRate(12, 'monthly', 'monthly')).toBeCloseTo(0.01, 10);
      expect(periodRate(5, 'monthly', 'semi_annual')).toBeCloseTo(0.004123915, 8);
    });

    // ---------- Settings ----------

    it('round-trips a settings patch', () => {
      const updated = repo.updateSettings({ user_name: 'Kevin' });
      expect(updated.user_name).toBe('Kevin');
      expect(repo.getSettings().user_name).toBe('Kevin');
    });

    it('defaults the phone home layout and round-trips a valid choice', () => {
      expect(repo.getSettings().mobile_home_layout).toBe('hero_actions');
      expect(repo.updateSettings({ mobile_home_layout: 'hero_tabs' }).mobile_home_layout).toBe(
        'hero_tabs'
      );
      expect(repo.getSettings().mobile_home_layout).toBe('hero_tabs');
    });

    it('falls back to the default home layout when the stored value is unknown', () => {
      // Guards against a hand-edited DB or a value written by a newer build.
      repo.setMeta('mobile_home_layout', 'not_a_layout');
      expect(repo.getSettings().mobile_home_layout).toBe('hero_actions');
    });

    it('round-trips the onboarding flag', () => {
      // A fresh database is a first run, so the welcome flow should show.
      expect(repo.getSettings().onboarded).toBe(false);
      expect(repo.updateSettings({ onboarded: true }).onboarded).toBe(true);
      expect(repo.getSettings().onboarded).toBe(true);
    });

    it('seeds the budget settings on a fresh install', () => {
      expect(repo.getSettings()).toMatchObject({
        theme: 'light',
        pay_amount: null,
        pay_frequency: 'biweekly',
        notify_daily_log: true,
        notify_daily_time: '19:00',
        notify_new_month: true,
        notify_weekly_report: true,
      });
    });

    it('round-trips pay settings and rejects nonsense', () => {
      repo.updateSettings({ pay_amount: 1200, pay_frequency: 'monthly' });
      expect(repo.getSettings()).toMatchObject({ pay_amount: 1200, pay_frequency: 'monthly' });
      repo.setMeta('pay_frequency', 'fortnightly');
      repo.setMeta('pay_amount', 'abc');
      expect(repo.getSettings()).toMatchObject({ pay_amount: null, pay_frequency: 'biweekly' });
    });

    it('stores and reads bookkeeping metadata', () => {
      expect(repo.getMeta('nope')).toBeNull();
      repo.setMeta('last_notified_date', '2026-08-06');
      expect(repo.getMeta('last_notified_date')).toBe('2026-08-06');
    });

    // ---------- CRUD + lastInsertRowid ----------

    it('creates a bill and reads it back by generated id', () => {
      const bill = repo.createBill({
        name: 'Hydro',
        amount: 120,
        frequency: 'monthly',
        anchor_date: '2026-01-15',
        category_id: null,
        autopay: false,
      });
      expect(bill.id).toBeGreaterThan(0);
      expect(bill.name).toBe('Hydro');
      expect(repo.listBills()).toHaveLength(1);
    });

    it('reports rows affected on delete', () => {
      const bill = repo.createBill({
        name: 'Gone',
        amount: 10,
        frequency: 'monthly',
        anchor_date: '2026-01-01',
        category_id: null,
        autopay: false,
      });
      expect(repo.deleteBill(bill.id)).toEqual({ ok: true });
      expect(repo.listBills()).toHaveLength(0);
    });

    // ---------- The two intentional bridges ----------

    it('charging an expense to a credit card increases its balance', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      repo.createExpense({
        description: 'Groceries',
        amount: 75,
        date: '2026-08-01',
        category_id: null,
        debt_id: card.id,
      });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(575, 6);
    });

    it('deleting a card-charged expense reverts the balance', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      const exp = repo.createExpense({
        description: 'Groceries',
        amount: 75,
        date: '2026-08-01',
        category_id: null,
        debt_id: card.id,
      });
      repo.deleteExpense(exp.id);
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(500, 6);
    });

    it('a paycheck debt allocation decrements the balance, and deleting it reverts', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      const pay = repo.createPaycheck({
        date: '2026-08-01',
        amount: 2000,
        allocations: [{ kind: 'debt', ref_id: card.id, amount: 200 }],
      });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(300, 6);
      repo.deletePaycheck(pay.id);
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(500, 6);
    });

    it('clamps a debt balance at zero rather than going negative', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 100,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      repo.createPaycheck({
        date: '2026-08-01',
        amount: 2000,
        allocations: [{ kind: 'debt', ref_id: card.id, amount: 500 }],
      });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBe(0);
    });

    // ---------- Transactions ----------

    it('writes a paycheck and all its allocations atomically', () => {
      const pay = repo.createPaycheck({
        date: '2026-08-01',
        amount: 2000,
        allocations: [
          { kind: 'fun', ref_id: null, amount: 100 },
          { kind: 'other', ref_id: null, amount: 50 },
        ],
      });
      expect(repo.getPaycheck(pay.id)!.allocations).toHaveLength(2);
    });

    // ---------- Aggregates must not throw on an empty DB ----------

    it('produces a dashboard snapshot with no data', () => {
      expect(() => repo.dashboardSnapshot()).not.toThrow();
    });

    // ---------- Categories (emoji / need-want / order) ----------

    it('suggests an emoji and need/want for a new category', () => {
      const rent = repo.createExpenseCategory({ name: 'Rent', color: '#000000' });
      expect(rent).toMatchObject({ emoji: '🏠', kind: 'need' });
      const own = repo.createExpenseCategory({ name: 'Rentals', color: '#000000', emoji: '🎿', kind: 'want' });
      expect(own).toMatchObject({ emoji: '🎿', kind: 'want' });
    });

    it('orders categories by their sort order, then by name', () => {
      const other = repo.listExpenseCategories().find((c) => c.name === 'Other')!;
      repo.updateExpenseCategory(other.id, { sort_order: 0 });
      expect(repo.listExpenseCategories()[0].name).toBe('Other');
    });

    // ---------- Funds ----------

    it('suggests an emoji for a new fund', () => {
      expect(repo.createGoal({ name: 'Japan trip', target_amount: 3500, color: '#000' }).emoji).toBe('✈️');
      expect(repo.createGoal({ name: 'Zzz', target_amount: 10, color: '#000' }).emoji).toBe('💰');
    });

    it('derives a fund balance from paychecks, deposits, withdrawals and fund purchases', () => {
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      repo.createPaycheck({
        date: '2026-07-01',
        amount: 1200,
        allocations: [{ kind: 'goal', ref_id: fund.id, amount: 40 }],
      });
      repo.addFundTransaction({ goal_id: fund.id, kind: 'deposit', amount: 100, date: '2026-08-01' });
      repo.addFundTransaction({ goal_id: fund.id, kind: 'withdrawal', amount: 30, date: '2026-08-02' });
      repo.createExpense({
        description: 'Hotel',
        amount: 20,
        date: '2026-08-03',
        category_id: null,
        fund_id: fund.id,
      });
      expect(repo.listGoals().find((g) => g.id === fund.id)!.current_amount).toBeCloseTo(90, 6);
      expect(
        repo.fundActivity(fund.id).map((a) => [a.kind, a.amount])
      ).toEqual([
        ['spend', -20],
        ['withdrawal', -30],
        ['deposit', 100],
        ['paycheck', 40],
      ]);
    });

    it('removing a fund transaction restores the balance', () => {
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      const tx = repo.addFundTransaction({ goal_id: fund.id, kind: 'deposit', amount: 100, date: '2026-08-01' });
      repo.deleteFundTransaction(tx.id);
      expect(repo.listGoals().find((g) => g.id === fund.id)!.current_amount).toBe(0);
    });

    it('an expense paid from a fund is never also charged to a card', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      const both = repo.createExpense({
        description: 'Hotel',
        amount: 75,
        date: '2026-08-01',
        category_id: null,
        debt_id: card.id,
        fund_id: fund.id,
      });
      expect(both).toMatchObject({ debt_id: null, fund_id: fund.id });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(500, 6);

      const charged = repo.createExpense({
        description: 'Dinner',
        amount: 40,
        date: '2026-08-02',
        category_id: null,
        debt_id: card.id,
      });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(540, 6);
      repo.updateExpense(charged.id, { fund_id: fund.id });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(500, 6);
    });

    // ---------- Deleting things a plan references ----------

    it('deleting a category, fund or debt removes the budget lines that point at it', () => {
      const db = getDb();
      const cat = repo.createExpenseCategory({ name: 'Snacks', color: '#000' });
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      const debt = repo.createDebt({
        name: 'Loan',
        type: 'loan',
        original_amount: 1000,
        current_balance: 1000,
        interest_rate: 5,
        payment_amount: 100,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      const exp = repo.createExpense({ description: 'Chips', amount: 3, date: '2026-08-01', category_id: cat.id });
      db.prepare("INSERT INTO budget_months (month) VALUES ('2026-08')").run();
      const line = db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-08', ?, ?, ?)");
      line.run('spend', cat.id, 50);
      line.run('fund', fund.id, 100);
      line.run('debt', debt.id, 100);

      repo.deleteExpenseCategory(cat.id);
      repo.hardDeleteGoal(fund.id);
      repo.deleteDebt(debt.id);

      expect(db.prepare('SELECT COUNT(*) AS n FROM budget_lines').get()).toEqual({ n: 0 });
      expect(repo.listExpenses().find((e) => e.id === exp.id)!.category_id).toBeNull();
    });

    // ---------- Recurring (interval, pause / resume) ----------

    it('generates every-N-months occurrences from the anchor and links them', () => {
      const todayIso = formatISO(new Date(), { representation: 'date' });
      const rec = repo.createRecurringExpense({
        description: 'Car insurance',
        amount: 412,
        category_id: null,
        frequency: 'monthly',
        interval_count: 6,
        anchor_date: '2026-02-15',
      });
      const generated = repo.listExpenses().filter((e) => e.recurring_id === rec.id);
      expect(generated.map((e) => e.date).sort()).toEqual(
        occurrencesInRange('2026-02-15', 'monthly', 6, '2026-02-15', todayIso)
      );
      expect(generated.length).toBeGreaterThanOrEqual(2);
      expect(rec).toMatchObject({ interval_count: 6, emoji: '🚗' });
    });

    it('resuming a paused template does not back-fill the paused months', () => {
      const anchor = formatISO(subMonths(new Date(), 3), { representation: 'date' });
      const rec = repo.createRecurringExpense({
        description: 'Gym',
        amount: 50,
        category_id: null,
        frequency: 'monthly',
        anchor_date: anchor,
      });
      const before = repo.listExpenses().length;
      repo.updateRecurringExpense(rec.id, { archived: true });
      expect(repo.listRecurringExpenses()).toHaveLength(0);
      expect(repo.listRecurringExpenses(true)).toHaveLength(1);
      // Pretend the template has been paused since it was created.
      getDb().prepare('UPDATE recurring_expenses SET last_generated = NULL WHERE id = ?').run(rec.id);
      repo.updateRecurringExpense(rec.id, { archived: false });
      expect(repo.listExpenses()).toHaveLength(before);
    });

    it('materializes recurring expenses idempotently', () => {
      repo.createRecurringExpense({
        description: 'Spotify',
        amount: 11.99,
        category_id: null,
        frequency: 'monthly',
        anchor_date: '2026-06-01',
      });
      repo.materializeRecurringExpenses();
      const first = repo.listExpenses().length;
      expect(first).toBeGreaterThan(0);
      repo.materializeRecurringExpenses();
      expect(repo.listExpenses()).toHaveLength(first);
    });
  });
}
