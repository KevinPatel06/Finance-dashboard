import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bill } from '../../shared/types';
import { differenceInCalendarDays, formatISO, parseISO, subMonths } from 'date-fns';
import { periodRate } from '../../shared/debtMath';
import { occurrencesInRange } from '../../shared/recurrence';
import { addMonthsToMonth } from '../../shared/paydays';
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

    it('deleting a category or debt removes the budget lines that point at it', () => {
      const db = getDb();
      const cat = repo.createExpenseCategory({ name: 'Snacks', color: '#000' });
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
      line.run('debt', debt.id, 100);

      repo.deleteExpenseCategory(cat.id);
      repo.deleteDebt(debt.id);

      expect(db.prepare('SELECT COUNT(*) AS n FROM budget_lines').get()).toEqual({ n: 0 });
      expect(repo.listExpenses().find((e) => e.id === exp.id)!.category_id).toBeNull();
    });

    it('marking a debt paid off hides it, keeps confirmed payments and drops unconfirmed plans', () => {
      const db = getDb();
      const thisMonth = formatISO(new Date(), { representation: 'date' }).slice(0, 7);
      const nextMonth = addMonthsToMonth(thisMonth, 1);
      const lastMonth = addMonthsToMonth(thisMonth, -1);
      const loan = repo.createDebt({
        name: 'Car',
        type: 'car_loan',
        original_amount: 5000,
        current_balance: 12.34,
        interest_rate: 6,
        payment_amount: 300,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      db.prepare("INSERT INTO budget_months (month, confirmed_at) VALUES (?, datetime('now'))").run(lastMonth);
      db.prepare("INSERT INTO budget_months (month, confirmed_at) VALUES (?, datetime('now'))").run(thisMonth);
      db.prepare('INSERT INTO budget_months (month) VALUES (?)').run(nextMonth);
      const line = db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES (?, 'debt', ?, 300)");
      for (const m of [lastMonth, thisMonth, nextMonth]) line.run(m, loan.id);

      expect(repo.markDebtPaidOff(loan.id)).toEqual({ ok: true });

      expect(repo.listDebts().map((d) => d.id)).not.toContain(loan.id);
      const [done] = repo.listPaidOffDebts();
      expect(done).toMatchObject({ id: loan.id, current_balance: 0, original_amount: 5000 });
      const months = db
        .prepare("SELECT month FROM budget_lines WHERE kind = 'debt' AND ref_id = ? ORDER BY month")
        .all(loan.id) as { month: string }[];
      expect(months.map((r) => r.month)).toEqual([lastMonth, thisMonth]);

      const back = repo.restoreDebt(loan.id);
      expect(back).toMatchObject({ archived: 0, current_balance: 0 });
      expect(repo.listPaidOffDebts()).toHaveLength(0);
      expect(repo.listDebts().map((d) => d.id)).toContain(loan.id);
    });

    it('money going back on a paid-off debt brings it back to the active list', () => {
      const card = repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 500,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
      // Paid down to 0 by a paycheck, then marked paid off.
      const pay = repo.createPaycheck({
        date: '2026-08-01',
        amount: 2000,
        allocations: [{ kind: 'debt', ref_id: card.id, amount: 500 }],
      });
      repo.markDebtPaidOff(card.id);
      // Undoing that payment means it's owing again.
      repo.deletePaycheck(pay.id);
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(500, 6);

      // A purchase charged to a paid-off card does the same.
      repo.updateDebt(card.id, { current_balance: 0 });
      repo.markDebtPaidOff(card.id);
      expect(repo.listDebts().map((d) => d.id)).not.toContain(card.id);
      repo.createExpense({ description: 'Coffee', amount: 5, date: '2026-08-02', category_id: null, debt_id: card.id });
      expect(repo.listDebts().find((d) => d.id === card.id)!.current_balance).toBeCloseTo(5, 6);
      expect(repo.listPaidOffDebts()).toHaveLength(0);
    });

    it('deleting a fund hides it everywhere but leaves the past as it was', () => {
      const db = getDb();
      const todayIso = formatISO(new Date(), { representation: 'date' });
      const thisMonth = todayIso.slice(0, 7);
      const lastMonth = addMonthsToMonth(thisMonth, -1);
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      const done = repo.createGoal({ name: 'Old car', target_amount: 500, color: '#000' });
      repo.deleteGoal(done.id); // mark complete

      for (const m of [lastMonth, thisMonth]) {
        db.prepare("INSERT INTO budget_months (month, confirmed_at) VALUES (?, datetime('now'))").run(m);
        db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES (?, 'fund', ?, 100)").run(m, fund.id);
      }
      repo.createExpense({ description: 'Flight', amount: 300, date: todayIso, category_id: null, fund_id: fund.id });
      const spentBefore = repo.budgetMonth(thisMonth).spent.total;

      repo.hardDeleteGoal(fund.id);
      repo.hardDeleteGoal(done.id);

      expect(repo.listGoals().map((g) => g.id)).not.toContain(fund.id);
      expect(repo.listArchivedGoals().map((g) => g.id)).not.toContain(done.id);
      // The flight was paid from the fund, so it still isn't everyday spending.
      expect(repo.budgetMonth(thisMonth).spent.total).toBe(spentBefore);
      expect(repo.listExpenses().find((e) => e.description === 'Flight')!.fund_id).toBe(fund.id);
      // Last month keeps its contribution; this month's is freed up.
      expect(repo.budgetMonth(lastMonth).planned.fund).toBe(100);
      expect(repo.budgetMonth(thisMonth).planned.fund).toBe(0);
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

    // ---------- Monthly budget ----------
    // Fixed months (2026-01/02) keep these independent of the real clock;
    // only the mirroring and pace tests need "now".

    const visaCard = () =>
      repo.createDebt({
        name: 'Visa',
        type: 'credit_card',
        original_amount: 0,
        current_balance: 500,
        interest_rate: 19.99,
        payment_amount: 0,
        payment_frequency: 'monthly',
        split_count: 1,
      });
    const groceriesId = () => repo.listExpenseCategories().find((c) => c.name === 'Groceries')!.id;
    const balanceOf = (debtId: number) => repo.listDebts().find((d) => d.id === debtId)!.current_balance;
    const fundOf = (goalId: number) =>
      [...repo.listGoals(), ...repo.listArchivedGoals()].find((g) => g.id === goalId)!.current_amount;
    const payMonthly = () =>
      repo.updateSettings({ pay_amount: 1200, pay_frequency: 'monthly', next_paycheck_date: '2026-01-05' });

    it('has no budget until one is set up', () => {
      expect(repo.budgetMonth().status).toBe('none');
      expect(getDb().prepare('SELECT COUNT(*) AS n FROM budget_months').get()).toEqual({ n: 0 });
    });

    it('confirming a plan pays debts and funds, and only everyday spending lowers left to spend', () => {
      payMonthly();
      const visa = visaCard();
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      repo.createRecurringExpense({
        description: 'Spotify',
        amount: 11.99,
        category_id: null,
        frequency: 'monthly',
        anchor_date: '2026-01-10',
      });

      const plan = repo.saveBudgetPlan(
        '2026-01',
        [
          { kind: 'spend', ref_id: groceriesId(), amount: 300 },
          { kind: 'fund', ref_id: fund.id, amount: 200 },
          { kind: 'debt', ref_id: visa.id, amount: 100 },
        ],
        true
      );
      expect(plan.status).toBe('confirmed');
      expect(plan.income).toBe(1200);
      expect(plan.recurring.total).toBeCloseTo(11.99, 6);
      expect(plan.planned).toMatchObject({ spend: 300, fund: 200, debt: 100, needs: 300, wants: 0 });
      expect(plan.leftToAllocate).toBeCloseTo(588.01, 6);
      expect(fundOf(fund.id)).toBe(200);
      expect(balanceOf(visa.id)).toBeCloseTo(400, 6);

      repo.createExpense({ description: 'No Frills', amount: 50, date: '2026-01-12', category_id: groceriesId() });
      repo.createExpense({ description: 'Hotel', amount: 20, date: '2026-01-13', category_id: null, fund_id: fund.id });
      const after = repo.budgetMonth('2026-01');
      expect(after.spent.total).toBe(50);
      expect(after.leftToSpend).toBe(250);
      expect(after.lines.spend[0]).toMatchObject({ amount: 300, spent: 50, left: 250 });
      expect(after.recurring.items[0]).toMatchObject({ description: 'Spotify', logged: true });
      expect(fundOf(fund.id)).toBe(180);
    });

    it('editing a confirmed month applies only the difference to a debt', () => {
      const visa = visaCard();
      repo.saveBudgetPlan('2026-01', [{ kind: 'debt', ref_id: visa.id, amount: 100 }], true);
      repo.setBudgetLine('2026-01', 'debt', visa.id, 150);
      expect(balanceOf(visa.id)).toBeCloseTo(350, 6);
      repo.removeBudgetLine('2026-01', 'debt', visa.id);
      expect(balanceOf(visa.id)).toBeCloseTo(500, 6);
    });

    it('a new month starts as a draft copy that applies nothing until confirmed', () => {
      const visa = visaCard();
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      repo.saveBudgetPlan(
        '2026-01',
        [
          { kind: 'spend', ref_id: groceriesId(), amount: 300 },
          { kind: 'fund', ref_id: fund.id, amount: 200 },
          { kind: 'debt', ref_id: visa.id, amount: 100 },
        ],
        true
      );
      const feb = repo.budgetMonth('2026-02');
      expect(feb.status).toBe('draft');
      expect(feb.planned).toMatchObject({ spend: 300, fund: 200, debt: 100 });
      expect(fundOf(fund.id)).toBe(200);
      expect(balanceOf(visa.id)).toBeCloseTo(400, 6);

      expect(repo.confirmBudgetMonth('2026-02').status).toBe('confirmed');
      expect(fundOf(fund.id)).toBe(400);
      expect(balanceOf(visa.id)).toBeCloseTo(300, 6);
    });

    it('does not copy a completed fund into the next month', () => {
      const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
      repo.saveBudgetPlan('2026-01', [{ kind: 'fund', ref_id: fund.id, amount: 200 }], true);
      repo.deleteGoal(fund.id); // "Mark complete"
      expect(repo.budgetMonth('2026-02').lines.fund).toHaveLength(0);
    });

    it('income follows confirmed paydays, bonuses and legacy paychecks', () => {
      // Weekly from Jan 1 2026: 1, 8, 15, 22 are regular; the 29th is a bonus.
      repo.updateSettings({ pay_amount: 500, pay_frequency: 'weekly', next_paycheck_date: '2026-01-01' });
      const jan = () => repo.budgetMonth('2026-01');
      expect(jan().paydays.map((p) => p.kind)).toEqual(['regular', 'regular', 'regular', 'regular', 'bonus']);
      expect(jan().income).toBe(2000);

      repo.confirmPayday('2026-01-08', 450);
      expect(jan().income).toBe(1950);
      expect(jan().paydays[1].paycheck).toMatchObject({ amount: 450 });

      repo.confirmPayday('2026-01-29', 500);
      expect(jan().income).toBe(2450);

      // A paycheck logged the old way, a day late, fills the payday instead of doubling it.
      repo.createPaycheck({ date: '2026-01-16', amount: 500, allocations: [] });
      expect(jan().income).toBe(2450);
      expect(jan().paydays[2].paycheck).toMatchObject({ amount: 500 });
    });

    it('confirming a payday twice updates it rather than adding a second paycheck', () => {
      payMonthly();
      repo.confirmPayday('2026-01-05', 1200);
      repo.confirmPayday('2026-01-05', 1100);
      expect(repo.budgetMonth('2026-01').income).toBe(1100);
      expect(repo.listPaychecks()).toHaveLength(1);
    });

    it('confirming a payday moves the next payday past today', () => {
      payMonthly();
      repo.confirmPayday('2026-01-05', 1200);
      expect(repo.getSettings().next_paycheck_date! > formatISO(new Date(), { representation: 'date' })).toBe(true);
    });

    it('"Not yet" snoozes a payday for today', () => {
      payMonthly();
      repo.snoozePayday('2026-01-05');
      expect(repo.budgetMonth('2026-01').paydays[0].snoozed).toBe(true);
    });

    it('mirrors the current month’s spending plan into the legacy budget caps', () => {
      const month = formatISO(new Date(), { representation: 'date' }).slice(0, 7);
      repo.saveBudgetPlan(month, [{ kind: 'spend', ref_id: groceriesId(), amount: 300 }], true);
      expect(repo.listExpenseBudgets().map((b) => [b.name, b.monthly_limit])).toEqual([['Groceries', 300]]);
    });

    it('reports pace and wants eating into needs', () => {
      const next = addMonthsToMonth(formatISO(new Date(), { representation: 'date' }).slice(0, 7), 1);
      const fun = repo.listExpenseCategories().find((c) => c.name === 'Entertainment')!.id;
      repo.saveBudgetPlan(
        next,
        [
          { kind: 'spend', ref_id: groceriesId(), amount: 300 },
          { kind: 'spend', ref_id: fun, amount: 50 },
        ],
        true
      );
      repo.createExpense({ description: 'Concert', amount: 80, date: `${next}-02`, category_id: fun });
      const v = repo.budgetMonth(next);
      expect(v.pace).toBe('fast'); // a future month has had no time to elapse
      expect(v.wantsEatingNeeds).toBe(true);
      expect(v.safePerDay).toBeCloseTo((350 - 80) / v.daysInMonth, 6);

      repo.createExpense({ description: 'Groceries', amount: 300, date: `${next}-03`, category_id: groceriesId() });
      expect(repo.budgetMonth(next).pace).toBe('over');
    });

    it('lists spending in categories without a budget', () => {
      repo.saveBudgetPlan('2026-01', [{ kind: 'spend', ref_id: groceriesId(), amount: 300 }], true);
      repo.createExpense({ description: 'Mystery', amount: 9, date: '2026-01-04', category_id: null });
      const v = repo.budgetMonth('2026-01');
      expect(v.unbudgeted).toEqual([expect.objectContaining({ category_id: null, spent: 9 })]);
      expect(v.leftToSpend).toBe(291);
    });

    // ---------- Weekly report ----------

    it('summarises a week against the previous one', () => {
      const g = groceriesId();
      repo.createExpense({ description: 'Farm Boy', amount: 50, date: '2026-10-06', category_id: g });
      repo.createExpense({ description: 'No Frills', amount: 10, date: '2026-10-12', category_id: g });
      repo.createExpense({ description: 'Costco', amount: 84.7, date: '2026-10-18', category_id: g });
      const r = repo.weeklyReport('2026-10-12');
      expect(r).toMatchObject({ weekStart: '2026-10-12', weekEnd: '2026-10-18', previousTotal: 50 });
      expect(r.total).toBeCloseTo(94.7, 6);
      expect(r.changePct).toBeCloseTo(89.4, 1);
      expect(r.dailyAverage).toBeCloseTo(94.7 / 7, 6);
      expect(r.biggestDay).toEqual({ date: '2026-10-18', total: 84.7 });
      expect(r.weeks.map((w) => w.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
      expect(r.weeks.map((w) => w.total)).toEqual([0, 0, 50, 94.7]);
      expect(r.byCategory[0]).toMatchObject({ name: 'Groceries', total: 94.7, previous: 50 });
      expect(r.insights[0]).toContain('Sunday');
      expect(r.insights[0]).toContain('$84.70');
    });

    it('has no percentage change when last week was empty', () => {
      repo.createExpense({ description: 'Lunch', amount: 12, date: '2026-08-04', category_id: null });
      expect(repo.weeklyReport('2026-08-03').changePct).toBeNull();
    });

    it('defaults to the last full week', () => {
      const r = repo.weeklyReport();
      expect(parseISO(r.weekStart).getDay()).toBe(1);
      expect(r.weekEnd < formatISO(new Date(), { representation: 'date' })).toBe(true);
      expect(differenceInCalendarDays(new Date(), parseISO(r.weekEnd))).toBeLessThanOrEqual(7);
    });

    // ---------- Import bills into recurring ----------

    it('imports active bills as recurring templates once', () => {
      const todayIso = formatISO(new Date(), { representation: 'date' });
      repo.createBill({ name: 'Rent', amount: 1450, frequency: 'monthly', anchor_date: '2026-01-01', category_id: null, autopay: false });
      repo.createBill({ name: 'Car insurance', amount: 412, frequency: 'semi_annual', anchor_date: '2026-02-15', category_id: null, autopay: false });
      repo.createBill({ name: 'Cleaner', amount: 80, frequency: 'custom_days', custom_days: 14, anchor_date: '2026-01-01', category_id: null, autopay: false });
      expect(repo.importBillsAsRecurring()).toEqual({ imported: 3 });
      const recs = repo.listRecurringExpenses();
      const by = (d: string) => recs.find((r) => r.description === d)!;
      expect(by('Rent')).toMatchObject({ frequency: 'monthly', interval_count: 1, amount: 1450 });
      expect(by('Car insurance')).toMatchObject({ frequency: 'monthly', interval_count: 6 });
      expect(by('Cleaner')).toMatchObject({ frequency: 'weekly', interval_count: 2 });
      for (const r of recs) expect(r.anchor_date >= todayIso).toBe(true);
      expect(repo.importBillsAsRecurring()).toEqual({ imported: 0 });
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
    // ---------- Contributions: registered accounts and their CRA years ----------

    describe('contributions — accounts', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 8, 12));
      });
      afterEach(() => vi.useRealTimers());

      it('creates an account in the current CRA year with an opening deposit', () => {
        const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true, already_contributed: 3600 });
        expect([a.tax_year, a.year_start, a.year_end, a.goal_deadline]).toEqual([2026, '2026-03-03', '2027-03-01', '2027-03-01']);
        expect([a.contributed, a.remaining, a.monthly_plan, a.months_left]).toEqual([3600, 10600, 600, 4]);
        expect(a.contributions[0]).toMatchObject({ date: '2026-03-03', amount: 3600 });
      });

      it('clamps a deadline past the CRA year end', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        expect(repo.updateRegisteredAccount(a.id, { goal_deadline: '2027-06-30' }).goal_deadline).toBe('2026-12-31');
      });

      it('deposits are assigned to years by date', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        repo.addRegisteredContribution({ account_id: a.id, amount: 500, date: '2025-12-31' });
        repo.addRegisteredContribution({ account_id: a.id, amount: 200, date: '2027-01-02' });
        const v = repo.listRegisteredAccounts()[0];
        expect([v.contributed, v.lifetime_contributed]).toEqual([0, 700]);
      });

      it('closes the year at the CRA end, not the goal deadline', () => {
        repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 7000, goal_deadline: '2026-06-30', budgeted: true });
        vi.setSystemTime(new Date(2026, 11, 31, 12));
        expect(repo.listRegisteredAccounts()[0].waiting).toBe(0);
        vi.setSystemTime(new Date(2027, 0, 1, 12));
        const v = repo.listRegisteredAccounts()[0];
        expect([v.waiting, v.past_years[0].tax_year, v.suggestion?.room, v.suggestion?.goal_deadline]).toEqual([1, 2026, 14000, '2027-12-31']);
      });

      it('RRSP waits for the user; deposits while waiting count toward the new year', () => {
        const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true });
        vi.setSystemTime(new Date(2027, 2, 10, 12));
        repo.addRegisteredContribution({ account_id: a.id, amount: 500, date: '2027-03-05' });
        let v = repo.listRegisteredAccounts()[0];
        expect([v.waiting, v.suggestion?.room, v.contributed, v.summary_pending?.tax_year]).toEqual([1, null, 500, 2026]);
        v = repo.startRegisteredYear(a.id, { contribution_room: 15000, goal: 6000, goal_deadline: '2028-02-29', budgeted: true });
        expect([v.tax_year, v.waiting, v.contributed, v.summary_pending]).toEqual([2027, 0, 500, null]);
      });

      it('a skipped year gets a past-years row and starts in the year containing today', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        vi.setSystemTime(new Date(2028, 4, 1, 12));
        repo.listRegisteredAccounts();
        const v = repo.startRegisteredYear(a.id, { contribution_room: 21000, goal: null, goal_deadline: '2028-12-31', budgeted: false });
        expect([v.tax_year, v.past_years.map((y) => y.tax_year)]).toEqual([2028, [2027, 2026]]);
      });

      it('snooze and acknowledge are per account', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        const b = repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000 });
        vi.setSystemTime(new Date(2027, 0, 2, 12));
        repo.snoozeRegisteredNewYear(a.id);
        repo.ackRegisteredSummary(b.id);
        const [va, vb] = repo.listRegisteredAccounts();
        expect([va.new_year_snoozed, vb.new_year_snoozed]).toEqual([true, false]);
        expect([va.summary_pending?.tax_year, vb.summary_pending]).toEqual([2026, null]);
      });

      it('a deposit logged after its year closed still counts for that year', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        repo.addRegisteredContribution({ account_id: a.id, amount: 5000, date: '2026-11-10' });
        vi.setSystemTime(new Date(2027, 0, 2, 12));
        repo.listRegisteredAccounts();
        repo.addRegisteredContribution({ account_id: a.id, amount: 2000, date: '2026-12-30' });
        const v = repo.listRegisteredAccounts()[0];
        expect(v.past_years[0].contributed).toBe(7000);
        expect(v.suggestion?.room).toBe(7000);
        expect(v.contributions.some((c) => c.date === '2026-12-30')).toBe(true);
      });

      it('deposits made in a skipped year come off the suggested room', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
        repo.addRegisteredContribution({ account_id: a.id, amount: 7000, date: '2026-06-01' });
        vi.setSystemTime(new Date(2027, 0, 2, 12));
        repo.listRegisteredAccounts();
        repo.addRegisteredContribution({ account_id: a.id, amount: 7000, date: '2027-06-01' });
        vi.setSystemTime(new Date(2028, 1, 1, 12));
        expect(repo.listRegisteredAccounts()[0].suggestion?.room).toBe(7000);
      });

      it("the FHSA lifetime cap ignores the new year's own deposits", () => {
        const a = repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000 });
        repo.addRegisteredContribution({ account_id: a.id, amount: 32000, date: '2026-05-01' });
        vi.setSystemTime(new Date(2027, 0, 3, 12));
        repo.addRegisteredContribution({ account_id: a.id, amount: 8000, date: '2027-01-02' });
        expect(repo.listRegisteredAccounts()[0].suggestion?.room).toBe(8000);
      });

      it('delete archives and hides the account', () => {
        const a = repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000 });
        repo.deleteRegisteredAccount(a.id);
        expect(repo.listRegisteredAccounts()).toHaveLength(0);
        const row = getDb().prepare('SELECT archived FROM registered_accounts WHERE id = ?').get(a.id) as { archived: number };
        expect(row.archived).toBe(1);
      });
    });
    describe('contributions — budget', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 8, 12));
      });
      afterEach(() => vi.useRealTimers());

      /** Confirms an empty October so November opens as a draft copy. */
      const draftMonth = (m: string) => {
        repo.saveBudgetPlan('2026-10', [], true);
        return repo.budgetMonth(m);
      };
      const rrsp = () =>
        repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true, already_contributed: 3600 });
      const contributionLineCount = () =>
        (getDb().prepare("SELECT COUNT(*) AS n FROM budget_lines WHERE kind = 'contribution'").get() as { n: number }).n;

      it('no accounts leaves the budget unchanged', () => {
        const fund = repo.createGoal({ name: 'Trip', target_amount: 1000, color: '#000' });
        repo.saveBudgetPlan('2026-11', [{ kind: 'fund', ref_id: fund.id, amount: 100 }], true);
        const v = repo.budgetMonth('2026-11');
        expect([v.lines.contribution, v.planned.contribution, v.saving.leftToDeposit, v.saving.due]).toEqual([[], 0, 0, []]);
        expect(v.saving).toMatchObject({ planned: 100, putAway: 100 });
      });

      it('a draft month gets the monthly split and it comes off the top', () => {
        const a = rrsp();
        const v = draftMonth('2026-11');
        expect(v.status).toBe('draft');
        expect(v.lines.contribution).toEqual([{ account_id: a.id, kind: 'rrsp', label: 'RRSP', amount: 600, deposited: 0, left: 600 }]);
        expect(v.planned.contribution).toBe(600);
        expect(v.leftToAllocate).toBeCloseTo(v.income - v.recurring.total - v.planned.debt - v.planned.fund - 600 - v.planned.spend, 6);
      });

      it('only logged deposits count toward put away and left to deposit', () => {
        const a = rrsp();
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        expect(repo.budgetMonth('2026-11').saving).toMatchObject({ putAway: 0, leftToDeposit: 600, due: ['RRSP'] });
        repo.addRegisteredContribution({ account_id: a.id, amount: 350, date: '2026-11-03' });
        const v = repo.budgetMonth('2026-11');
        expect(v.saving).toMatchObject({ planned: 600, putAway: 350, leftToDeposit: 250, due: ['RRSP'] });
        expect(v.lines.contribution[0]).toMatchObject({ amount: 600, deposited: 350, left: 250 });
      });

      it('confirmed lines are frozen', () => {
        const a = rrsp();
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        const withExtra = repo.addRegisteredContribution({ account_id: a.id, amount: 1000, date: '2026-11-05' });
        expect(repo.budgetMonth('2026-11').lines.contribution[0].amount).toBe(600);
        repo.deleteRegisteredContribution(withExtra.contributions[0].id);
        expect(repo.budgetMonth('2026-11').lines.contribution[0].amount).toBe(600);
        expect(repo.listRegisteredAccounts()[0].schedule.find((r) => r.month === '2026-12')?.planned).toBe(600);
      });

      it('an extra deposit lowers next month', () => {
        const a = rrsp();
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        repo.addRegisteredContribution({ account_id: a.id, amount: 1000, date: '2026-11-05' });
        vi.setSystemTime(new Date(2026, 11, 1, 12));
        expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(466.67);
      });

      it('a short month raises the next', () => {
        const a = rrsp();
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        repo.addRegisteredContribution({ account_id: a.id, amount: 300, date: '2026-11-05' });
        vi.setSystemTime(new Date(2026, 11, 1, 12));
        expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(700);
      });

      it('an early deadline: no lines after it, deposits still count', () => {
        const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 7000, goal_deadline: '2026-06-30', budgeted: true });
        repo.addRegisteredContribution({ account_id: a.id, amount: 1000, date: '2026-11-10' });
        expect(draftMonth('2026-11').lines.contribution).toEqual([]);
        expect(repo.listRegisteredAccounts()[0]).toMatchObject({ contributed: 1000, waiting: 0 });
      });

      it("a deposit for last year's RRSP doesn't pay this year's line", () => {
        const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200 });
        vi.setSystemTime(new Date(2027, 2, 5, 12));
        repo.addRegisteredContribution({ account_id: a.id, amount: 3000, date: '2027-03-01' });
        repo.listRegisteredAccounts();
        repo.startRegisteredYear(a.id, { contribution_room: 15000, goal: 12000, goal_deadline: '2028-02-29', budgeted: true });
        repo.saveBudgetPlan('2027-02', [], true);
        const v = repo.budgetMonth('2027-03');
        expect(v.lines.contribution[0]).toMatchObject({ amount: 1000, deposited: 0, left: 1000 });
        expect(v.saving.putAway).toBe(0);
      });

      it('no line without a positive remaining goal', () => {
        repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, budgeted: true });
        repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000, goal: 0, budgeted: true });
        repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 9000, goal: 500, budgeted: true, already_contributed: 500 });
        expect(draftMonth('2026-11').lines.contribution).toEqual([]);
        expect(contributionLineCount()).toBe(0);
      });

      it('budgeting switched on after confirming starts next month', () => {
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 7000, budgeted: true });
        expect(repo.budgetMonth('2026-11').lines.contribution).toEqual([]);
        vi.setSystemTime(new Date(2026, 11, 1, 12));
        expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(7000);
      });

      it('archiving keeps confirmed months and drops unconfirmed ones', () => {
        const a = rrsp();
        draftMonth('2026-11');
        repo.confirmBudgetMonth('2026-11');
        expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(800);
        repo.deleteRegisteredAccount(a.id);
        expect(repo.budgetMonth('2026-11').lines.contribution).toHaveLength(1);
        expect(repo.budgetMonth('2026-12').lines.contribution).toHaveLength(0);
      });

      it('setup ("none") months return suggestions without storing them', () => {
        repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 1200, budgeted: true });
        const v = repo.budgetMonth('2026-11');
        expect([v.status, v.lines.contribution[0]?.amount, v.planned.contribution]).toEqual(['none', 600, 600]);
        expect(contributionLineCount()).toBe(0);
      });

      it('lists lines RRSP, TFSA, FHSA and names who is due', () => {
        repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000, goal: 2000, budgeted: true });
        repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 1200, budgeted: true });
        rrsp();
        draftMonth('2026-11');
        const v = repo.confirmBudgetMonth('2026-11');
        expect(v.lines.contribution.map((l) => l.kind)).toEqual(['rrsp', 'tfsa', 'fhsa']);
        expect(v.saving.due).toEqual(['RRSP', 'TFSA', 'FHSA']);
      });
    });
  });
}
