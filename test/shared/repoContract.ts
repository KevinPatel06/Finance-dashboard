import { describe, it, expect, beforeEach } from 'vitest';
import type { Bill } from '../../shared/types';
import { periodRate } from '../../shared/debtMath';
import * as repo from '../../electron/db/repo';

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
