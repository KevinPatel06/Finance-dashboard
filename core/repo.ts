import { getDb } from './db';
import type {
  AppSettings,
  Bill,
  BillInput,
  BillMonthItem,
  BudgetLineKind,
  BudgetMonthView,
  BudgetStatus,
  Category,
  CategoryKind,
  DashboardSnapshot,
  Debt,
  DebtInput,
  DebtLineView,
  Expense,
  ExpenseCategory,
  ExpenseCategoryInput,
  ExpenseInput,
  FundActivityItem,
  FundLineView,
  FundTransaction,
  MonthStatus,
  PaceStatus,
  Payday,
  PlanLineInput,
  RecurringOccurrence,
  SpendLineView,
  WeeklyReport,
  ExpenseReport,
  Paycheck,
  PaycheckAllocationInput,
  PaycheckWithAllocations,
  RecurringExpense,
  RecurringExpenseInput,
  RecurringFrequency,
  RegisteredAccount,
  RegisteredAccountInput,
  MobileHomeLayout,
  PayFrequency,
  RegisteredContribution,
  RegisteredContributionInput,
  SavingsGoal,
  SavingsGoalInput,
} from '../shared/types';
// Value import (the others above are types only).
import { MOBILE_HOME_LAYOUTS } from '../shared/types';
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  formatISO,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfMonth,
} from 'date-fns';
import { periodRate } from '../shared/debtMath';
import { suggestEmoji, suggestKind } from '../shared/emoji';
import { latestOccurrenceOnOrBefore, occurrencesInRange } from '../shared/recurrence';
import { monthBounds, monthOf, nextPaydayAfter, paydaysInMonth } from '../shared/paydays';

// ---------- helpers ----------
const today = () => formatISO(new Date(), { representation: 'date' });

function rowsAsBills(rows: any[]): Bill[] {
  return rows.map((r) => ({ ...r })) as Bill[];
}

/**
 * Project the next due date for a bill on or after `from`.
 */
export function nextDueOnOrAfter(bill: Bill, from: Date): Date {
  const anchor = parseISO(bill.anchor_date);
  if (anchor >= from) return anchor;

  switch (bill.frequency) {
    case 'biweekly': {
      const days = 14;
      const diff = Math.ceil(differenceInCalendarDays(from, anchor) / days);
      return addDays(anchor, diff * days);
    }
    case 'monthly': {
      let d = anchor;
      while (d < from) d = addMonths(d, 1);
      return d;
    }
    case 'semi_annual': {
      let d = anchor;
      while (d < from) d = addMonths(d, 6);
      return d;
    }
    case 'yearly': {
      let d = anchor;
      while (d < from) d = addYears(d, 1);
      return d;
    }
    case 'custom_days': {
      const days = Math.max(1, bill.custom_days ?? 30);
      const diff = Math.ceil(differenceInCalendarDays(from, anchor) / days);
      return addDays(anchor, diff * days);
    }
  }
}

/** All due dates of `bill` in [from, to]. */
export function occurrencesBetween(bill: Bill, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let d = nextDueOnOrAfter(bill, from);
  let guard = 0;
  while (d <= to && guard++ < 500) {
    out.push(d);
    switch (bill.frequency) {
      case 'biweekly':
        d = addDays(d, 14);
        break;
      case 'monthly':
        d = addMonths(d, 1);
        break;
      case 'semi_annual':
        d = addMonths(d, 6);
        break;
      case 'yearly':
        d = addYears(d, 1);
        break;
      case 'custom_days':
        d = addDays(d, Math.max(1, bill.custom_days ?? 30));
        break;
    }
  }
  return out;
}

/** Convert a bill's amount to its biweekly-equivalent. */
export function billPerBiweekly(bill: Bill): number {
  switch (bill.frequency) {
    case 'biweekly':
      return bill.amount;
    case 'monthly':
      return (bill.amount * 12) / 26;
    case 'semi_annual':
      return (bill.amount * 2) / 26;
    case 'yearly':
      return bill.amount / 26;
    case 'custom_days': {
      const days = Math.max(1, bill.custom_days ?? 30);
      return (bill.amount * 14) / days;
    }
  }
}

// ---------- Settings ----------
export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const ACCENTS = ['emerald', 'cyan', 'orange', 'pink', 'red', 'yellow', 'purple'] as const;
  const accent = (ACCENTS as readonly string[]).includes(map.accent_color)
    ? (map.accent_color as (typeof ACCENTS)[number])
    : 'emerald';
  const homeLayout = (MOBILE_HOME_LAYOUTS as readonly string[]).includes(map.mobile_home_layout)
    ? (map.mobile_home_layout as MobileHomeLayout)
    : 'hero_actions';
  const payAmount = Number(map.pay_amount);
  const payFrequency = (PAY_FREQUENCIES as readonly string[]).includes(map.pay_frequency)
    ? (map.pay_frequency as PayFrequency)
    : 'biweekly';
  return {
    theme: map.theme === 'dark' ? 'dark' : 'light',
    pay_cadence: 'biweekly',
    next_paycheck_date: map.next_paycheck_date || null,
    accent_color: accent,
    user_name: map.user_name?.trim() || 'Kevin',
    mobile_home_layout: homeLayout,
    onboarded: map.onboarded === 'true',
    // Notification prefs default ON when unset; lead time defaults to 3 days.
    notify_enabled: map.notify_enabled !== 'false',
    notify_bill_lead_days: Number(map.notify_bill_lead_days) || 3,
    notify_paycheck: map.notify_paycheck !== 'false',
    notify_budget: map.notify_budget !== 'false',
    pay_amount: map.pay_amount && Number.isFinite(payAmount) && payAmount > 0 ? payAmount : null,
    pay_frequency: payFrequency,
    notify_daily_log: map.notify_daily_log !== 'false',
    notify_daily_time: /^\d{2}:\d{2}$/.test(map.notify_daily_time ?? '')
      ? map.notify_daily_time
      : '19:00',
    notify_new_month: map.notify_new_month !== 'false',
    notify_weekly_report: map.notify_weekly_report !== 'false',
  };
}

const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semi_monthly', 'monthly'] as const;

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      upsert.run(k, v == null ? '' : String(v));
    }
  });
  tx();
  return getSettings();
}

/** Raw settings access for internal bookkeeping keys (not part of AppSettings). */
export function getMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}
export function setMeta(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

// ---------- Categories ----------
export function listCategories(): Category[] {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
}
export function createCategory(input: { name: string; color: string }): Category {
  const db = getDb();
  const info = db
    .prepare('INSERT INTO categories (name, color) VALUES (?, ?)')
    .run(input.name, input.color);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) as Category;
}
export function updateCategory(id: number, input: { name?: string; color?: string }): Category {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category;
  if (!cur) throw new Error('Category not found');
  db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(
    input.name ?? cur.name,
    input.color ?? cur.color,
    id
  );
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as Category;
}
export function deleteCategory(id: number): { ok: true } {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { ok: true };
}

// ---------- Bills ----------
export function listBills(): Bill[] {
  return rowsAsBills(
    getDb().prepare('SELECT * FROM bills WHERE archived = 0 ORDER BY name').all()
  );
}

export function createBill(input: BillInput): Bill {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO bills (name, amount, frequency, custom_days, anchor_date, category_id, autopay, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.amount,
      input.frequency,
      input.custom_days ?? null,
      input.anchor_date,
      input.category_id,
      input.autopay ? 1 : 0,
      input.notes ?? null
    );
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid) as Bill;
}

export function updateBill(id: number, input: Partial<BillInput>): Bill {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill;
  if (!cur) throw new Error('Bill not found');
  db.prepare(
    `UPDATE bills SET name = ?, amount = ?, frequency = ?, custom_days = ?, anchor_date = ?,
       category_id = ?, autopay = ?, notes = ? WHERE id = ?`
  ).run(
    input.name ?? cur.name,
    input.amount ?? cur.amount,
    input.frequency ?? cur.frequency,
    input.custom_days ?? cur.custom_days ?? null,
    input.anchor_date ?? cur.anchor_date,
    input.category_id ?? cur.category_id,
    input.autopay == null ? cur.autopay : input.autopay ? 1 : 0,
    input.notes ?? cur.notes,
    id
  );
  return db.prepare('SELECT * FROM bills WHERE id = ?').get(id) as Bill;
}

export function deleteBill(id: number): { ok: true } {
  getDb().prepare('UPDATE bills SET archived = 1 WHERE id = ?').run(id);
  return { ok: true };
}

export function upcomingBills(fromIso: string, toIso: string) {
  const bills = listBills();
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const from = parseISO(fromIso);
  const to = parseISO(toIso);
  const events: Array<{ bill: Bill; dueDate: string; category: Category | null }> = [];
  for (const b of bills) {
    for (const d of occurrencesBetween(b, from, to)) {
      events.push({
        bill: b,
        dueDate: formatISO(d, { representation: 'date' }),
        category: b.category_id ? cats.get(b.category_id) ?? null : null,
      });
    }
  }
  events.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return events;
}

// ---------- Bills to pay (per-occurrence payment tracking) ----------
//
// We don't store a separate "paid" flag. When a paycheck pays a bill, the
// allocation row records the occurrence's due date in its `note` field
// (kind='bill'). So the set of paid (billId, dueDate) pairs is derived from
// existing allocation data — this works retroactively on past paychecks too.

/** Set of "<billId>|<YYYY-MM-DD>" for every bill occurrence already paid. */
function paidBillOccurrences(db = getDb()): Set<string> {
  const rows = db
    .prepare(
      "SELECT ref_id, note FROM paycheck_allocations WHERE kind = 'bill' AND ref_id IS NOT NULL AND note IS NOT NULL"
    )
    .all() as { ref_id: number; note: string }[];
  const set = new Set<string>();
  for (const r of rows) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.note)) set.add(`${r.ref_id}|${r.note}`);
  }
  return set;
}

/**
 * Earliest date a bill can be considered "due" for tracking purposes:
 * the date it was added (so a newly-added bill with an old start date doesn't
 * instantly show months of fake overdue charges), bounded to at most ~12
 * months back as a safety cap against pathological data.
 */
function billTrackingFloor(bill: Bill, todayD: Date): Date {
  const created = bill.created_at
    ? parseISO(bill.created_at.slice(0, 10))
    : parseISO(bill.anchor_date);
  const cap = addDays(todayD, -366);
  return created > cap ? created : cap;
}

export interface BillToPayRow {
  bill: Bill;
  dueDate: string;
  category: Category | null;
  overdue: boolean;
}

/**
 * Unpaid bill occurrences the user still owes: everything from each bill's
 * tracking floor through `windowEndIso`, minus occurrences already paid.
 * `overdue` = due strictly before today. Sorted overdue-first, then by date.
 */
export function billsToPay(windowEndIso: string): BillToPayRow[] {
  const db = getDb();
  const bills = listBills();
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const paid = paidBillOccurrences(db);
  const todayD = new Date();
  const todayStr = today();
  const windowEnd = parseISO(windowEndIso);

  const rows: BillToPayRow[] = [];
  for (const b of bills) {
    const floor = billTrackingFloor(b, todayD);
    for (const d of occurrencesBetween(b, floor, windowEnd)) {
      const dueStr = formatISO(d, { representation: 'date' });
      if (paid.has(`${b.id}|${dueStr}`)) continue; // already paid → skip
      rows.push({
        bill: b,
        dueDate: dueStr,
        category: b.category_id ? cats.get(b.category_id) ?? null : null,
        overdue: dueStr < todayStr,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });
  return rows;
}

/**
 * Every bill occurrence falling in the current calendar month — paid or not.
 * Used by the Dashboard "Bills to pay this month" card. Sorted overdue →
 * due-soon (unpaid) → paid (so paid items sit greyed at the bottom).
 */
export function billsThisMonth(): BillMonthItem[] {
  const db = getDb();
  const bills = listBills();
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const paid = paidBillOccurrences(db);
  const todayD = new Date();
  const todayStr = today();
  const monthStart = startOfMonth(todayD);
  const monthEnd = endOfMonth(todayD);

  const rows: BillMonthItem[] = [];
  for (const b of bills) {
    const floor = billTrackingFloor(b, todayD);
    const start = floor > monthStart ? floor : monthStart;
    for (const d of occurrencesBetween(b, start, monthEnd)) {
      const dueStr = formatISO(d, { representation: 'date' });
      const isPaid = paid.has(`${b.id}|${dueStr}`);
      rows.push({
        bill: b,
        dueDate: dueStr,
        category: b.category_id ? cats.get(b.category_id) ?? null : null,
        overdue: !isPaid && dueStr < todayStr,
        paid: isPaid,
      });
    }
  }
  // group rank: overdue(0) → unpaid upcoming(1) → paid(2); within group by date
  const rank = (r: BillMonthItem) => (r.paid ? 2 : r.overdue ? 0 : 1);
  rows.sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.dueDate.localeCompare(b.dueDate);
  });
  return rows;
}

export interface BillStatusRow {
  bill: Bill;
  category: Category | null;
  status: 'overdue' | 'due_soon' | 'ok';
  nextDueDate: string | null;
  overdueCount: number;
  overdueAmount: number;
}

/** Per-bill payment status for the Bills page + Dashboard tracker. */
export function billStatuses(): BillStatusRow[] {
  const db = getDb();
  const bills = listBills();
  const cats = new Map(listCategories().map((c) => [c.id, c]));
  const paid = paidBillOccurrences(db);
  const todayD = new Date();
  const todayStr = today();
  const dueSoonHorizon = addDays(todayD, 14);
  const lookEnd = addDays(todayD, 366);

  return bills.map((b) => {
    const floor = billTrackingFloor(b, todayD);
    let overdueCount = 0;
    let overdueAmount = 0;
    let nextUnpaid: string | null = null;

    for (const d of occurrencesBetween(b, floor, lookEnd)) {
      const dueStr = formatISO(d, { representation: 'date' });
      if (paid.has(`${b.id}|${dueStr}`)) continue;
      if (dueStr < todayStr) {
        overdueCount++;
        overdueAmount += b.amount;
      } else if (nextUnpaid === null) {
        nextUnpaid = dueStr;
      }
    }

    let status: BillStatusRow['status'];
    if (overdueCount > 0) status = 'overdue';
    else if (nextUnpaid && parseISO(nextUnpaid) <= dueSoonHorizon) status = 'due_soon';
    else status = 'ok';

    const nextDueDate =
      nextUnpaid ?? formatISO(nextDueOnOrAfter(b, todayD), { representation: 'date' });

    return {
      bill: b,
      category: b.category_id ? cats.get(b.category_id) ?? null : null,
      status,
      nextDueDate,
      overdueCount,
      overdueAmount,
    };
  });
}

// ---------- Goals (funds) ----------
//
// A fund's balance is derived, never stored: legacy paycheck allocations +
// planned contributions from CONFIRMED budget months + deposits − withdrawals
// − purchases paid from the fund. Deriving it means editing or deleting any
// of those sources can never leave the balance out of step.

export function fundBalance(goalId: number, db = getDb()): number {
  const row = db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM paycheck_allocations
           WHERE kind = 'goal' AND ref_id = ?)
       + (SELECT COALESCE(SUM(l.amount), 0) FROM budget_lines l
           JOIN budget_months m ON m.month = l.month
          WHERE l.kind = 'fund' AND l.ref_id = ? AND m.confirmed_at IS NOT NULL)
       + (SELECT COALESCE(SUM(CASE kind WHEN 'deposit' THEN amount ELSE -amount END), 0)
            FROM fund_transactions WHERE goal_id = ?)
       - (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE fund_id = ?) AS total`
    )
    .get(goalId, goalId, goalId, goalId) as { total: number };
  return Math.round(row.total * 100) / 100;
}

function withBalance(g: Omit<SavingsGoal, 'current_amount'>, db = getDb()): SavingsGoal {
  return { ...g, current_amount: fundBalance(g.id, db) };
}

export function listGoals(): SavingsGoal[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM savings_goals WHERE archived = 0 ORDER BY name')
    .all() as SavingsGoal[];
  return rows.map((g) => withBalance(g, db));
}

export function createGoal(input: SavingsGoalInput): SavingsGoal {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO savings_goals (name, target_amount, target_date, color, emoji)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.target_amount,
      input.target_date ?? null,
      input.color,
      input.emoji || suggestEmoji(input.name, '💰')
    );
  const g = db
    .prepare('SELECT * FROM savings_goals WHERE id = ?')
    .get(info.lastInsertRowid) as SavingsGoal;
  return withBalance(g, db);
}

export function updateGoal(id: number, input: Partial<SavingsGoalInput>): SavingsGoal {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as SavingsGoal;
  if (!cur) throw new Error('Goal not found');
  db.prepare(
    'UPDATE savings_goals SET name = ?, target_amount = ?, target_date = ?, color = ?, emoji = ? WHERE id = ?'
  ).run(
    input.name ?? cur.name,
    input.target_amount ?? cur.target_amount,
    input.target_date === undefined ? cur.target_date : input.target_date,
    input.color ?? cur.color,
    input.emoji ?? cur.emoji,
    id
  );
  const next = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as SavingsGoal;
  return withBalance(next, db);
}

/** Archives the goal — on the phone this is "Mark complete". */
export function deleteGoal(id: number): { ok: true } {
  getDb()
    .prepare(
      "UPDATE savings_goals SET archived = 1, archived_at = COALESCE(archived_at, datetime('now')) WHERE id = ?"
    )
    .run(id);
  return { ok: true };
}

export function listArchivedGoals(): SavingsGoal[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM savings_goals WHERE archived = 1 ORDER BY archived_at DESC, id DESC')
    .all() as SavingsGoal[];
  return rows.map((g) => withBalance(g, db));
}

/**
 * Delete a goal for good, as far as the user can tell. The row stays behind
 * as `archived = 2`, which every goal list skips (they ask for 0 or 1), so
 * nothing it was part of gets rewritten: purchases paid from it still aren't
 * everyday spending (a real DELETE would null their fund_id), and earlier
 * months keep the contributions they planned into it. This month's and later
 * plan lines go, freeing that money to be planned elsewhere. Past paycheck
 * allocations never pointed at the row, so they stay either way.
 */
export function hardDeleteGoal(id: number): { ok: true } {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM budget_lines WHERE kind = 'fund' AND ref_id = ? AND month >= ?").run(
      id,
      monthOf(today())
    );
    db.prepare(
      "UPDATE savings_goals SET archived = 2, archived_at = COALESCE(archived_at, datetime('now')) WHERE id = ?"
    ).run(id);
  })();
  return { ok: true };
}

export function restoreGoal(id: number): SavingsGoal | null {
  const db = getDb();
  db.prepare('UPDATE savings_goals SET archived = 0, archived_at = NULL WHERE id = ?').run(id);
  const cur = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as
    | SavingsGoal
    | undefined;
  return cur ? withBalance(cur, db) : null;
}

/** Money into or out of a fund from outside the budget. */
export function addFundTransaction(input: {
  goal_id: number;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  date: string;
  note?: string | null;
}): FundTransaction {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO fund_transactions (goal_id, kind, amount, date, note) VALUES (?, ?, ?, ?, ?)'
    )
    .run(input.goal_id, input.kind, input.amount, input.date, input.note ?? null);
  return db
    .prepare('SELECT * FROM fund_transactions WHERE id = ?')
    .get(info.lastInsertRowid) as FundTransaction;
}

export function deleteFundTransaction(id: number): { ok: true } {
  getDb().prepare('DELETE FROM fund_transactions WHERE id = ?').run(id);
  return { ok: true };
}

/** Everything that moved a fund's balance, newest first. */
export function fundActivity(goalId: number): FundActivityItem[] {
  const db = getDb();
  const items: FundActivityItem[] = [];

  const pays = db
    .prepare(
      `SELECT a.id, p.date, a.amount FROM paycheck_allocations a
         JOIN paychecks p ON p.id = a.paycheck_id
        WHERE a.kind = 'goal' AND a.ref_id = ?`
    )
    .all(goalId) as { id: number; date: string; amount: number }[];
  for (const r of pays) {
    items.push({ id: `pay:${r.id}`, date: r.date, kind: 'paycheck', amount: r.amount, label: 'From paycheck', ref_id: null });
  }

  const lines = db
    .prepare(
      `SELECT l.id, l.month, l.amount FROM budget_lines l
         JOIN budget_months m ON m.month = l.month
        WHERE l.kind = 'fund' AND l.ref_id = ? AND m.confirmed_at IS NOT NULL AND l.amount > 0`
    )
    .all(goalId) as { id: number; month: string; amount: number }[];
  for (const r of lines) {
    items.push({
      id: `line:${r.id}`,
      date: `${r.month}-01`,
      kind: 'contribution',
      amount: r.amount,
      label: `${format(parseISO(`${r.month}-01`), 'MMMM yyyy')} budget`,
      ref_id: null,
    });
  }

  const txs = db
    .prepare('SELECT * FROM fund_transactions WHERE goal_id = ?')
    .all(goalId) as FundTransaction[];
  for (const t of txs) {
    items.push({
      id: `tx:${t.id}`,
      date: t.date,
      kind: t.kind,
      amount: t.kind === 'deposit' ? t.amount : -t.amount,
      label: t.note || (t.kind === 'deposit' ? 'Added money' : 'Withdrew money'),
      ref_id: t.id,
    });
  }

  const spent = db
    .prepare('SELECT id, date, amount, description FROM expenses WHERE fund_id = ?')
    .all(goalId) as { id: number; date: string; amount: number; description: string }[];
  for (const e of spent) {
    items.push({ id: `exp:${e.id}`, date: e.date, kind: 'spend', amount: -e.amount, label: e.description, ref_id: null });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

// ---------- Paychecks ----------
export function listPaychecks(): PaycheckWithAllocations[] {
  const db = getDb();
  const checks = db
    .prepare('SELECT * FROM paychecks ORDER BY date DESC, id DESC')
    .all() as Paycheck[];
  const allocStmt = db.prepare('SELECT * FROM paycheck_allocations WHERE paycheck_id = ?');
  return checks.map((p) => {
    const allocs = allocStmt.all(p.id) as PaycheckWithAllocations['allocations'];
    return { ...p, allocations: allocs, totals: computeTotals(p.amount, allocs) };
  });
}

export function getPaycheck(id: number): PaycheckWithAllocations | null {
  const db = getDb();
  const p = db.prepare('SELECT * FROM paychecks WHERE id = ?').get(id) as Paycheck | undefined;
  if (!p) return null;
  const allocs = db
    .prepare('SELECT * FROM paycheck_allocations WHERE paycheck_id = ?')
    .all(id) as PaycheckWithAllocations['allocations'];
  return { ...p, allocations: allocs, totals: computeTotals(p.amount, allocs) };
}

export function createPaycheck(input: {
  date: string;
  amount: number;
  notes?: string | null;
  allocations: PaycheckAllocationInput[];
}): PaycheckWithAllocations {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO paychecks (date, amount, notes) VALUES (?, ?, ?)')
      .run(input.date, input.amount, input.notes ?? null);
    const pid = info.lastInsertRowid as number;
    const insertAlloc = db.prepare(
      `INSERT INTO paycheck_allocations (paycheck_id, kind, ref_id, amount, note)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of input.allocations) {
      insertAlloc.run(pid, a.kind, a.ref_id, a.amount, a.note ?? null);
    }
    applyDebtPayments(db, input.allocations);
    return pid;
  });
  const pid = tx() as number;
  return getPaycheck(pid)!;
}

export function updatePaycheck(
  id: number,
  input: {
    date: string;
    amount: number;
    notes?: string | null;
    allocations: PaycheckAllocationInput[];
  }
): PaycheckWithAllocations {
  const db = getDb();
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM paychecks WHERE id = ?').get(id);
    if (!existing) throw new Error('Paycheck not found');
    db.prepare('UPDATE paychecks SET date = ?, amount = ?, notes = ? WHERE id = ?').run(
      input.date,
      input.amount,
      input.notes ?? null,
      id
    );
    revertDebtPaymentsForPaycheck(db, id);
    db.prepare('DELETE FROM paycheck_allocations WHERE paycheck_id = ?').run(id);
    const insertAlloc = db.prepare(
      `INSERT INTO paycheck_allocations (paycheck_id, kind, ref_id, amount, note)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of input.allocations) {
      insertAlloc.run(id, a.kind, a.ref_id, a.amount, a.note ?? null);
    }
    applyDebtPayments(db, input.allocations);
  });
  tx();
  return getPaycheck(id)!;
}

export function deletePaycheck(id: number): { ok: true } {
  const db = getDb();
  const tx = db.transaction(() => {
    revertDebtPaymentsForPaycheck(db, id);
    db.prepare('DELETE FROM paychecks WHERE id = ?').run(id);
  });
  tx();
  return { ok: true };
}

function computeTotals(amount: number, allocs: { kind: string; amount: number }[]) {
  const t = { bills: 0, goals: 0, fun: 0, debt: 0, other: 0 };
  for (const a of allocs) {
    if (a.kind === 'bill') t.bills += a.amount;
    else if (a.kind === 'goal') t.goals += a.amount;
    else if (a.kind === 'fun') t.fun += a.amount;
    else if (a.kind === 'debt') t.debt += a.amount;
    else t.other += a.amount;
  }
  const allocated = t.bills + t.goals + t.fun + t.debt + t.other;
  return { ...t, allocated, remainder: amount - allocated };
}

// ---------- Debt balance bookkeeping ----------
// Paycheck 'debt' allocations pay a revolving debt DOWN; expenses charged to a
// credit card push its balance UP. Reversals run on edit/delete so balances
// stay consistent. MAX(0, …) honours the table's CHECK (current_balance >= 0).

function applyDebtPayments(db: ReturnType<typeof getDb>, allocs: PaycheckAllocationInput[]) {
  const pay = db.prepare(
    'UPDATE debts SET current_balance = MAX(0, current_balance - ?) WHERE id = ?'
  );
  for (const a of allocs) {
    if (a.kind === 'debt' && a.ref_id != null && a.amount > 0) pay.run(a.amount, a.ref_id);
  }
}

function revertDebtPaymentsForPaycheck(db: ReturnType<typeof getDb>, paycheckId: number) {
  const olds = db
    .prepare(
      "SELECT ref_id, amount FROM paycheck_allocations WHERE paycheck_id = ? AND kind = 'debt' AND ref_id IS NOT NULL"
    )
    .all(paycheckId) as { ref_id: number; amount: number }[];
  const undo = db.prepare('UPDATE debts SET current_balance = current_balance + ? WHERE id = ?');
  for (const o of olds) undo.run(o.amount, o.ref_id);
}

// ---------- Dashboard ----------
export function dashboardSnapshot(): DashboardSnapshot {
  const db = getDb();
  const settings = getSettings();
  const todayDate = new Date();
  const todayIso = today();

  const nextDate = settings.next_paycheck_date || null;
  const daysUntil = nextDate
    ? differenceInCalendarDays(parseISO(nextDate), todayDate)
    : null;

  // Dashboard tracker: this calendar month's bills (paid + unpaid), sorted
  // overdue → due-soon → paid.
  const billsMonth = billsThisMonth();

  const goals = listGoals();
  const goalProgress = goals.map((g) => ({
    goal: g,
    pctComplete: g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0,
  }));

  const startMonth = startOfMonth(todayDate);
  const endMonth = endOfMonth(todayDate);
  const startIso = formatISO(startMonth, { representation: 'date' });
  const endIso = formatISO(endMonth, { representation: 'date' });

  const incomeRow = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS v FROM paychecks WHERE date BETWEEN ? AND ?')
    .get(startIso, endIso) as { v: number };

  const allocSums = db
    .prepare(
      `SELECT a.kind, COALESCE(SUM(a.amount), 0) AS v
         FROM paycheck_allocations a
         JOIN paychecks p ON p.id = a.paycheck_id
        WHERE p.date BETWEEN ? AND ?
        GROUP BY a.kind`
    )
    .all(startIso, endIso) as { kind: string; v: number }[];

  const thisMonth = { income: incomeRow.v, billsPaid: 0, savings: 0, fun: 0 };
  for (const r of allocSums) {
    if (r.kind === 'bill') thisMonth.billsPaid = r.v;
    else if (r.kind === 'goal') thisMonth.savings = r.v;
    else if (r.kind === 'fun') thisMonth.fun = r.v;
  }

  const bills = listBills();
  const smoothed = bills.reduce((acc, b) => acc + billPerBiweekly(b), 0);

  // Historical average: how much (on average) each logged paycheck has
  // contributed to savings goals. Empty until at least one paycheck is logged.
  const checkCount = db.prepare('SELECT COUNT(*) AS c FROM paychecks').get() as { c: number };
  const totalSavings = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS v FROM paycheck_allocations WHERE kind = 'goal'"
    )
    .get() as { v: number };
  const averageSavingsPerPaycheck = checkCount.c > 0 ? totalSavings.v / checkCount.c : 0;

  return {
    nextPaycheckDate: nextDate,
    daysUntilNextPaycheck: daysUntil,
    billsThisMonth: billsMonth,
    goalProgress,
    thisMonth,
    smoothedPerPaycheck: smoothed,
    averageSavingsPerPaycheck,
    paycheckCount: checkCount.c,
  };
}

// ---------- Reports ----------
export function reportByCategory(fromIso: string, toIso: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.color, COALESCE(SUM(a.amount), 0) AS total
         FROM paycheck_allocations a
         JOIN paychecks p ON p.id = a.paycheck_id
         JOIN bills b ON b.id = a.ref_id AND a.kind = 'bill'
         LEFT JOIN categories c ON c.id = b.category_id
        WHERE p.date BETWEEN ? AND ?
        GROUP BY c.id`
    )
    .all(fromIso, toIso) as { id: number | null; name: string | null; color: string | null; total: number }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Uncategorized',
    color: r.color ?? '#64748b',
    total: r.total,
  }));
}

export function reportMonthly(months: number) {
  const db = getDb();
  const now = new Date();
  const buckets: { month: string; income: number; bills: number; savings: number; fun: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = addMonths(now, -i);
    const s = startOfMonth(d);
    const e = endOfMonth(d);
    const sIso = formatISO(s, { representation: 'date' });
    const eIso = formatISO(e, { representation: 'date' });
    const inc = db
      .prepare('SELECT COALESCE(SUM(amount),0) AS v FROM paychecks WHERE date BETWEEN ? AND ?')
      .get(sIso, eIso) as { v: number };
    const allocs = db
      .prepare(
        `SELECT a.kind, COALESCE(SUM(a.amount),0) AS v
           FROM paycheck_allocations a
           JOIN paychecks p ON p.id = a.paycheck_id
          WHERE p.date BETWEEN ? AND ?
          GROUP BY a.kind`
      )
      .all(sIso, eIso) as { kind: string; v: number }[];
    const row = { month: sIso.slice(0, 7), income: inc.v, bills: 0, savings: 0, fun: 0 };
    for (const r of allocs) {
      if (r.kind === 'bill') row.bills = r.v;
      else if (r.kind === 'goal') row.savings = r.v;
      else if (r.kind === 'fun') row.fun = r.v;
    }
    buckets.push(row);
  }
  return buckets;
}

// ---------- Calendar ----------
export function calendarEvents(fromIso: string, toIso: string) {
  const db = getDb();
  const upcoming = upcomingBills(fromIso, toIso);
  const paid = db
    .prepare(
      `SELECT p.date, b.id AS bill_id, b.name AS bill_name, a.amount
         FROM paycheck_allocations a
         JOIN paychecks p ON p.id = a.paycheck_id
         JOIN bills b ON b.id = a.ref_id
        WHERE a.kind = 'bill' AND p.date BETWEEN ? AND ?`
    )
    .all(fromIso, toIso) as { date: string; bill_id: number; bill_name: string; amount: number }[];
  const paychecks = db
    .prepare('SELECT id, date, amount FROM paychecks WHERE date BETWEEN ? AND ?')
    .all(fromIso, toIso) as { id: number; date: string; amount: number }[];
  return { upcoming, paid, paychecks };
}

// ============================================================================
// Debts — self-contained like expenses; never touches paycheck/bill math.
// All payoff projections are computed in the renderer from these raw fields.
// ============================================================================

/** Interest date in the month of `base`, clamping day 29-31 to the month's last day. */
function interestDateInMonth(base: Date, day: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), Math.min(day, getDaysInMonth(base)));
}

/** First interest date strictly after `after`. */
function nextInterestDate(after: Date, day: number): Date {
  const sameMonth = interestDateInMonth(after, day);
  if (sameMonth > after) return sameMonth;
  return interestDateInMonth(addMonths(startOfMonth(after), 1), day);
}

/**
 * Auto-apply monthly interest to revolving debts whose interest day has
 * passed. Idempotent: `last_interest_applied` records the last charged date,
 * so reopening the app never double-charges. Compounds if multiple months
 * elapsed since last launch.
 */
function applyPendingInterest(db = getDb()) {
  const rows = db
    .prepare(
      `SELECT * FROM debts
        WHERE archived = 0 AND interest_day IS NOT NULL
          AND type IN ('credit_card','line_of_credit')`
    )
    .all() as Debt[];
  const todayStr = today();
  const update = db.prepare(
    'UPDATE debts SET current_balance = ?, last_interest_applied = ? WHERE id = ?'
  );
  for (const d of rows) {
    const day = d.interest_day!;
    let cursor = parseISO(d.last_interest_applied ?? d.created_at.slice(0, 10));
    let balance = d.current_balance;
    let lastCharged: string | null = null;
    let next = nextInterestDate(cursor, day);
    let guard = 0;
    // Interest hits monthly (on interest_day), but the per-month rate must
    // honour the debt's compounding convention — mirror periodRate('monthly').
    const monthlyRate = periodRate(d.interest_rate, 'monthly', d.compounding);
    while (formatISO(next, { representation: 'date' }) <= todayStr && guard++ < 600) {
      balance = Math.round(balance * (1 + monthlyRate) * 100) / 100;
      lastCharged = formatISO(next, { representation: 'date' });
      next = nextInterestDate(next, day);
    }
    if (lastCharged) update.run(balance, lastCharged, d.id);
  }
}

export function listDebts(): Debt[] {
  const db = getDb();
  applyPendingInterest(db);
  return db
    .prepare('SELECT * FROM debts WHERE archived = 0 ORDER BY current_balance DESC')
    .all() as Debt[];
}

export function createDebt(input: DebtInput): Debt {
  const db = getDb();
  const interestDay = input.interest_day ?? null;
  const info = db
    .prepare(
      `INSERT INTO debts (name, type, original_amount, current_balance, interest_rate,
         payment_amount, payment_frequency, split_count, interest_day, last_interest_applied,
         compounding, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.name,
      input.type,
      input.original_amount,
      input.current_balance,
      input.interest_rate,
      input.payment_amount,
      input.payment_frequency,
      Math.max(1, input.split_count),
      interestDay,
      // Charging starts from today — never retro-charge months before the debt existed here.
      interestDay != null ? today() : null,
      input.compounding ?? (input.type === 'mortgage' ? 'semi_annual' : 'monthly'),
      input.notes ?? null
    );
  return db.prepare('SELECT * FROM debts WHERE id = ?').get(info.lastInsertRowid) as Debt;
}

export function updateDebt(id: number, input: Partial<DebtInput>): Debt {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM debts WHERE id = ?').get(id) as Debt;
  if (!cur) throw new Error('Debt not found');
  const nextInterestDay = input.interest_day === undefined ? cur.interest_day : input.interest_day;
  // (Re)setting the interest day restarts charging from today, so a newly set
  // day can't retroactively bill months that predate the change.
  const nextLastApplied =
    nextInterestDay == null
      ? null
      : nextInterestDay !== cur.interest_day
        ? today()
        : cur.last_interest_applied ?? today();
  db.prepare(
    `UPDATE debts SET name = ?, type = ?, original_amount = ?, current_balance = ?,
       interest_rate = ?, payment_amount = ?, payment_frequency = ?, split_count = ?,
       interest_day = ?, last_interest_applied = ?, compounding = ?, notes = ?
     WHERE id = ?`
  ).run(
    input.name ?? cur.name,
    input.type ?? cur.type,
    input.original_amount ?? cur.original_amount,
    input.current_balance ?? cur.current_balance,
    input.interest_rate ?? cur.interest_rate,
    input.payment_amount ?? cur.payment_amount,
    input.payment_frequency ?? cur.payment_frequency,
    Math.max(1, input.split_count ?? cur.split_count),
    nextInterestDay,
    nextLastApplied,
    input.compounding ?? cur.compounding,
    input.notes === undefined ? cur.notes : input.notes,
    id
  );
  return db.prepare('SELECT * FROM debts WHERE id = ?').get(id) as Debt;
}

export function deleteDebt(id: number): { ok: true } {
  const db = getDb();
  db.prepare("DELETE FROM budget_lines WHERE kind = 'debt' AND ref_id = ?").run(id);
  db.prepare('DELETE FROM debts WHERE id = ?').run(id);
  return { ok: true };
}

// ============================================================================
// Expenses — fully self-contained. None of the functions below read from or
// write to paychecks/bills/goals, so expenses never affect dashboard, paycheck,
// or calendar numbers.
// ============================================================================

// ---------- Expense categories ----------
export function listExpenseCategories(): ExpenseCategory[] {
  return getDb()
    .prepare('SELECT * FROM expense_categories ORDER BY COALESCE(sort_order, 1000000), name')
    .all() as ExpenseCategory[];
}

export function createExpenseCategory(input: ExpenseCategoryInput): ExpenseCategory {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO expense_categories (name, color, emoji, kind, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      input.name,
      input.color,
      input.emoji || suggestEmoji(input.name),
      input.kind ?? suggestKind(input.name),
      input.sort_order ?? null
    );
  return db
    .prepare('SELECT * FROM expense_categories WHERE id = ?')
    .get(info.lastInsertRowid) as ExpenseCategory;
}

export function updateExpenseCategory(
  id: number,
  input: Partial<ExpenseCategoryInput>
): ExpenseCategory {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategory;
  if (!cur) throw new Error('Expense category not found');
  db.prepare(
    'UPDATE expense_categories SET name = ?, color = ?, emoji = ?, kind = ?, sort_order = ? WHERE id = ?'
  ).run(
    input.name ?? cur.name,
    input.color ?? cur.color,
    input.emoji ?? cur.emoji,
    input.kind ?? cur.kind,
    input.sort_order === undefined ? cur.sort_order : input.sort_order,
    id
  );
  return db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategory;
}

export function deleteExpenseCategory(id: number): { ok: true } {
  const db = getDb();
  // ON DELETE SET NULL keeps the expenses but clears their category; the
  // budget lines planning money for it have no FK, so they go explicitly.
  db.prepare("DELETE FROM budget_lines WHERE kind = 'spend' AND ref_id = ?").run(id);
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
  return { ok: true };
}

// ---------- Budgets ----------
export function listExpenseBudgets(): BudgetStatus[] {
  const db = getDb();
  const now = new Date();
  const from = formatISO(startOfMonth(now), { representation: 'date' });
  const to = formatISO(endOfMonth(now), { representation: 'date' });
  return db
    .prepare(
      `SELECT c.id AS category_id, c.name, c.color, b.monthly_limit,
              COALESCE((
                SELECT SUM(e.amount) FROM expenses e
                 WHERE e.category_id = c.id AND e.date BETWEEN ? AND ?
              ), 0) AS spent
         FROM expense_budgets b
         JOIN expense_categories c ON c.id = b.category_id
        ORDER BY c.name`
    )
    .all(from, to) as BudgetStatus[];
}

export function setExpenseBudget(categoryId: number, monthlyLimit: number): { ok: true } {
  const db = getDb();
  if (monthlyLimit > 0) {
    db.prepare(
      `INSERT INTO expense_budgets (category_id, monthly_limit) VALUES (?, ?)
         ON CONFLICT(category_id) DO UPDATE SET monthly_limit = excluded.monthly_limit`
    ).run(categoryId, monthlyLimit);
  } else {
    // A zero/blank limit clears the budget.
    db.prepare('DELETE FROM expense_budgets WHERE category_id = ?').run(categoryId);
  }
  return { ok: true };
}

// ---------- Expenses ----------
export function listExpenses(): Expense[] {
  materializeRecurringExpenses();
  return getDb()
    .prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC')
    .all() as Expense[];
}

// Charging an expense to a credit card raises that card's balance; un-linking
// or deleting the expense lowers it back.
const chargeDebt = (db: ReturnType<typeof getDb>, debtId: number, amount: number) =>
  db
    .prepare('UPDATE debts SET current_balance = current_balance + ? WHERE id = ?')
    .run(amount, debtId);
const unchargeDebt = (db: ReturnType<typeof getDb>, debtId: number, amount: number) =>
  db
    .prepare('UPDATE debts SET current_balance = MAX(0, current_balance - ?) WHERE id = ?')
    .run(amount, debtId);

/**
 * `recurringId` is set only by materializeRecurringExpenses — it's how the
 * budget tells a recurring charge (taken off the top) from everyday spending.
 * An expense paid from a fund is never also charged to a card.
 */
export function createExpense(input: ExpenseInput, recurringId: number | null = null): Expense {
  const db = getDb();
  const fundId = input.fund_id ?? null;
  const debtId = fundId != null ? null : input.debt_id ?? null;
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (description, amount, date, category_id, note, debt_id, fund_id, recurring_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.description,
        input.amount,
        input.date,
        input.category_id ?? null,
        input.note ?? null,
        debtId,
        fundId,
        recurringId
      );
    if (debtId != null && input.amount > 0) chargeDebt(db, debtId, input.amount);
    return info.lastInsertRowid as number;
  });
  const id = tx() as number;
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense;
}

export function updateExpense(id: number, input: Partial<ExpenseInput>): Expense {
  const db = getDb();
  const tx = db.transaction(() => {
    const cur = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense;
    if (!cur) throw new Error('Expense not found');
    const nextFundId = input.fund_id === undefined ? cur.fund_id : input.fund_id;
    const nextDebtId =
      nextFundId != null ? null : input.debt_id === undefined ? cur.debt_id : input.debt_id;
    const nextAmount = input.amount ?? cur.amount;
    // Reverse the old charge, apply the new one (covers amount and card changes).
    if (cur.debt_id != null && cur.amount > 0) unchargeDebt(db, cur.debt_id, cur.amount);
    if (nextDebtId != null && nextAmount > 0) chargeDebt(db, nextDebtId, nextAmount);
    db.prepare(
      `UPDATE expenses SET description = ?, amount = ?, date = ?, category_id = ?, note = ?,
         debt_id = ?, fund_id = ?
         WHERE id = ?`
    ).run(
      input.description ?? cur.description,
      nextAmount,
      input.date ?? cur.date,
      input.category_id === undefined ? cur.category_id : input.category_id,
      input.note === undefined ? cur.note : input.note,
      nextDebtId,
      nextFundId,
      id
    );
  });
  tx();
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense;
}

export function deleteExpense(id: number): { ok: true } {
  const db = getDb();
  const tx = db.transaction(() => {
    const cur = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Expense | undefined;
    if (cur?.debt_id != null && cur.amount > 0) unchargeDebt(db, cur.debt_id, cur.amount);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  });
  tx();
  return { ok: true };
}

// ---------- Recurring expenses ----------
// Occurrences are computed from the anchor (shared/recurrence.ts), so a
// template on the 31st stays on the 31st. `archived = 1` means paused.

export function listRecurringExpenses(includeArchived = false): RecurringExpense[] {
  return getDb()
    .prepare(
      `SELECT * FROM recurring_expenses ${includeArchived ? '' : 'WHERE archived = 0'}
        ORDER BY created_at DESC, id DESC`
    )
    .all() as RecurringExpense[];
}

export function createRecurringExpense(input: RecurringExpenseInput): RecurringExpense {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO recurring_expenses
         (description, amount, category_id, debt_id, frequency, anchor_date, interval_count, emoji, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.description,
      input.amount,
      input.category_id ?? null,
      input.debt_id ?? null,
      input.frequency,
      input.anchor_date,
      Math.max(1, input.interval_count ?? 1),
      input.emoji || suggestEmoji(input.description, '🔁'),
      input.archived ? 1 : 0
    );
  materializeRecurringExpenses();
  return db
    .prepare('SELECT * FROM recurring_expenses WHERE id = ?')
    .get(info.lastInsertRowid) as RecurringExpense;
}

export function updateRecurringExpense(
  id: number,
  input: Partial<RecurringExpenseInput>
): RecurringExpense {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id) as
    | RecurringExpense
    | undefined;
  if (!cur) throw new Error('Recurring expense not found');
  const next = {
    frequency: input.frequency ?? cur.frequency,
    anchor_date: input.anchor_date ?? cur.anchor_date,
    interval_count: Math.max(1, input.interval_count ?? cur.interval_count),
    archived: input.archived === undefined ? cur.archived : input.archived ? 1 : 0,
  };
  // Resuming must not back-fill the months it was paused for: treat every
  // occurrence up to today as already handled.
  const lastGenerated =
    cur.archived === 1 && next.archived === 0
      ? latestOccurrenceOnOrBefore(next.anchor_date, next.frequency, next.interval_count, today()) ??
        cur.last_generated
      : cur.last_generated;
  db.prepare(
    `UPDATE recurring_expenses SET description = ?, amount = ?, category_id = ?, debt_id = ?,
        frequency = ?, anchor_date = ?, interval_count = ?, emoji = ?, archived = ?, last_generated = ?
      WHERE id = ?`
  ).run(
    input.description ?? cur.description,
    input.amount ?? cur.amount,
    input.category_id === undefined ? cur.category_id : input.category_id,
    input.debt_id === undefined ? cur.debt_id : input.debt_id,
    next.frequency,
    next.anchor_date,
    next.interval_count,
    input.emoji ?? cur.emoji,
    next.archived,
    lastGenerated,
    id
  );
  materializeRecurringExpenses();
  return db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id) as RecurringExpense;
}

export function deleteRecurringExpense(id: number): { ok: true } {
  // Stops future generation; already-generated expenses stay in the ledger.
  getDb().prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id);
  return { ok: true };
}

/**
 * Generate any due expense occurrences for active templates, advancing each
 * template's `last_generated`. Idempotent — runs cheaply on every expense read.
 */
export function materializeRecurringExpenses(): void {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM recurring_expenses WHERE archived = 0')
    .all() as RecurringExpense[];
  const todayStr = today();
  const updateGen = db.prepare('UPDATE recurring_expenses SET last_generated = ? WHERE id = ?');

  for (const r of rows) {
    const from = r.last_generated
      ? formatISO(addDays(parseISO(r.last_generated), 1), { representation: 'date' })
      : r.anchor_date;
    if (from > todayStr) continue;
    const due = occurrencesInRange(r.anchor_date, r.frequency, r.interval_count, from, todayStr);
    for (const date of due) {
      // Reuse createExpense so the credit-card bridge (balance increase) and
      // its own transaction are honoured.
      createExpense(
        {
          description: r.description,
          amount: r.amount,
          date,
          category_id: r.category_id,
          note: 'Recurring',
          debt_id: r.debt_id,
        },
        r.id
      );
    }
    if (due.length > 0) updateGen.run(due[due.length - 1], r.id);
  }
}

// ---------- Registered accounts (RRSP / TFSA / FHSA) ----------
export function listRegisteredAccounts(): RegisteredAccount[] {
  const db = getDb();
  const accounts = db
    .prepare('SELECT * FROM registered_accounts WHERE archived = 0 ORDER BY created_at')
    .all() as Omit<RegisteredAccount, 'contributed' | 'remaining' | 'contributions'>[];
  const contribStmt = db.prepare(
    'SELECT * FROM registered_contributions WHERE account_id = ? ORDER BY date DESC, id DESC'
  );
  return accounts.map((a) => {
    const contributions = contribStmt.all(a.id) as RegisteredContribution[];
    const contributed = contributions.reduce((sum, c) => sum + c.amount, 0);
    return {
      ...a,
      contributions,
      contributed,
      remaining: a.contribution_room - contributed,
    };
  });
}

export function createRegisteredAccount(input: RegisteredAccountInput): RegisteredAccount {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO registered_accounts (kind, label, contribution_room, notes)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.kind, input.label, input.contribution_room, input.notes ?? null);
  return getRegisteredAccount(info.lastInsertRowid as number);
}

export function updateRegisteredAccount(
  id: number,
  input: Partial<RegisteredAccountInput>
): RegisteredAccount {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM registered_accounts WHERE id = ?').get(id) as
    | RegisteredAccount
    | undefined;
  if (!cur) throw new Error('Registered account not found');
  db.prepare(
    `UPDATE registered_accounts SET kind = ?, label = ?, contribution_room = ?, notes = ?
       WHERE id = ?`
  ).run(
    input.kind ?? cur.kind,
    input.label ?? cur.label,
    input.contribution_room ?? cur.contribution_room,
    input.notes === undefined ? cur.notes : input.notes,
    id
  );
  return getRegisteredAccount(id);
}

export function deleteRegisteredAccount(id: number): { ok: true } {
  // Contributions cascade-delete via the FK.
  getDb().prepare('DELETE FROM registered_accounts WHERE id = ?').run(id);
  return { ok: true };
}

export function addRegisteredContribution(
  input: RegisteredContributionInput
): RegisteredAccount {
  const db = getDb();
  db.prepare(
    `INSERT INTO registered_contributions (account_id, amount, date, note)
     VALUES (?, ?, ?, ?)`
  ).run(input.account_id, input.amount, input.date, input.note ?? null);
  return getRegisteredAccount(input.account_id);
}

export function deleteRegisteredContribution(id: number): { ok: true } {
  getDb().prepare('DELETE FROM registered_contributions WHERE id = ?').run(id);
  return { ok: true };
}

function getRegisteredAccount(id: number): RegisteredAccount {
  const acc = listRegisteredAccounts().find((a) => a.id === id);
  if (!acc) throw new Error('Registered account not found');
  return acc;
}

// ============================================================================
// Monthly budget (phone)
//
// Zero-based: income − recurring − debt payments − fund contributions =
// spending money, split across Needs/Wants categories. A month is a row in
// budget_months; it starts as a DRAFT copied from the previous month and only
// applies debt payments and fund contributions once CONFIRMED. Recurring
// charges are taken off the top, so only everyday expenses (not recurring,
// not paid from a fund) lower "left to spend".
// ============================================================================

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Everyday spending: not generated by a recurring template, not paid from a fund. */
const EVERYDAY = "recurring_id IS NULL AND COALESCE(note, '') <> 'Recurring' AND fund_id IS NULL";

/** How far a logged paycheck may sit from its payday and still count as it. */
const PAYDAY_MATCH_DAYS = 4;

type Db = ReturnType<typeof getDb>;

function monthStatus(db: Db, month: string): MonthStatus | null {
  const row = db.prepare('SELECT confirmed_at FROM budget_months WHERE month = ?').get(month) as
    | { confirmed_at: string | null }
    | undefined;
  if (!row) return null;
  return row.confirmed_at ? 'confirmed' : 'draft';
}

/**
 * Makes sure `month` exists when it can: an existing row is returned as is;
 * otherwise the latest earlier month is copied into a draft. With no earlier
 * month at all the budget hasn't been set up, so nothing is created.
 */
function ensureBudgetMonth(db: Db, month: string): MonthStatus {
  const status = monthStatus(db, month);
  if (status) return status;
  const prev = db
    .prepare('SELECT month FROM budget_months WHERE month < ? ORDER BY month DESC LIMIT 1')
    .get(month) as { month: string } | undefined;
  if (!prev) return 'none';
  db.prepare('INSERT INTO budget_months (month) VALUES (?)').run(month);
  // Copy last month's plan, minus anything that no longer makes sense:
  // deleted categories, completed/deleted funds, paid-off/archived debts.
  db.prepare(
    `INSERT INTO budget_lines (month, kind, ref_id, amount)
     SELECT ?, l.kind, l.ref_id, l.amount FROM budget_lines l
      WHERE l.month = ?
        AND ((l.kind = 'spend' AND EXISTS (SELECT 1 FROM expense_categories c WHERE c.id = l.ref_id))
          OR (l.kind = 'fund' AND EXISTS
               (SELECT 1 FROM savings_goals g WHERE g.id = l.ref_id AND g.archived = 0))
          OR (l.kind = 'debt' AND EXISTS
               (SELECT 1 FROM debts d WHERE d.id = l.ref_id AND d.archived = 0 AND d.current_balance > 0)))
      ORDER BY l.id`
  ).run(month, prev.month);
  return 'draft';
}

/** Debt payments currently applied to balances by `month` (only once confirmed). */
function appliedDebtLines(db: Db, month: string): Map<number, number> {
  const out = new Map<number, number>();
  if (monthStatus(db, month) !== 'confirmed') return out;
  const rows = db
    .prepare("SELECT ref_id, amount FROM budget_lines WHERE month = ? AND kind = 'debt'")
    .all(month) as { ref_id: number; amount: number }[];
  for (const r of rows) out.set(r.ref_id, r.amount);
  return out;
}

/** Positive delta pays a debt down (clamped at 0); negative adds it back. */
function applyDebtLineDelta(db: Db, debtId: number, delta: number) {
  if (delta > 0) {
    db.prepare('UPDATE debts SET current_balance = MAX(0, current_balance - ?) WHERE id = ?').run(delta, debtId);
  } else if (delta < 0) {
    db.prepare('UPDATE debts SET current_balance = current_balance + ? WHERE id = ?').run(-delta, debtId);
  }
}

/**
 * The desktop's budget bars and "over budget" reminder read expense_budgets.
 * Keep it equal to the current month's spending plan so both apps agree.
 */
function mirrorSpendLinesToLegacyBudgets(db: Db, month: string) {
  if (month !== monthOf(today())) return;
  db.prepare('DELETE FROM expense_budgets').run();
  db.prepare(
    `INSERT INTO expense_budgets (category_id, monthly_limit)
     SELECT l.ref_id, l.amount FROM budget_lines l
      WHERE l.month = ? AND l.kind = 'spend' AND l.amount > 0
        AND EXISTS (SELECT 1 FROM expense_categories c WHERE c.id = l.ref_id)`
  ).run(month);
}

/**
 * Runs a change to a month's plan and reconciles debt balances with whatever
 * the month now applies — so confirming, editing and removing lines all go
 * through one rule: balance moves by (applied after − applied before).
 */
function changePlan(month: string, fn: (db: Db) => void): BudgetMonthView {
  const db = getDb();
  const tx = db.transaction(() => {
    if (ensureBudgetMonth(db, month) === 'none') {
      db.prepare('INSERT INTO budget_months (month) VALUES (?)').run(month);
    }
    const before = appliedDebtLines(db, month);
    fn(db);
    const after = appliedDebtLines(db, month);
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      applyDebtLineDelta(db, id, (after.get(id) ?? 0) - (before.get(id) ?? 0));
    }
    mirrorSpendLinesToLegacyBudgets(db, month);
  });
  tx();
  return budgetMonth(month);
}

const upsertLine = (db: Db, month: string, kind: BudgetLineKind, refId: number, amount: number) =>
  db
    .prepare(
      `INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(month, kind, ref_id) DO UPDATE SET amount = excluded.amount`
    )
    .run(month, kind, refId, Math.max(0, amount));

export function setBudgetLine(
  month: string,
  kind: BudgetLineKind,
  refId: number,
  amount: number
): BudgetMonthView {
  return changePlan(month, (db) => upsertLine(db, month, kind, refId, amount));
}

export function removeBudgetLine(month: string, kind: BudgetLineKind, refId: number): BudgetMonthView {
  return changePlan(month, (db) =>
    db.prepare('DELETE FROM budget_lines WHERE month = ? AND kind = ? AND ref_id = ?').run(month, kind, refId)
  );
}

/** Replaces every line of `month`; `confirm` also confirms it. */
export function saveBudgetPlan(month: string, lines: PlanLineInput[], confirm: boolean): BudgetMonthView {
  return changePlan(month, (db) => {
    db.prepare('DELETE FROM budget_lines WHERE month = ?').run(month);
    for (const l of lines) upsertLine(db, month, l.kind, l.ref_id, l.amount);
    if (confirm) {
      db.prepare(
        "UPDATE budget_months SET confirmed_at = COALESCE(confirmed_at, datetime('now')) WHERE month = ?"
      ).run(month);
    }
  });
}

export function confirmBudgetMonth(month: string): BudgetMonthView {
  return changePlan(month, (db) =>
    db
      .prepare("UPDATE budget_months SET confirmed_at = COALESCE(confirmed_at, datetime('now')) WHERE month = ?")
      .run(month)
  );
}

// ---------- Paydays ----------

/**
 * The month's scheduled paydays, each matched to a paycheck: first one
 * confirmed for exactly that payday, else (for paychecks logged the old way)
 * the closest unmatched one within PAYDAY_MATCH_DAYS. Paychecks left over
 * are ad-hoc income.
 */
function monthPaydays(db: Db, month: string, todayIso: string): { paydays: Payday[]; adhoc: number } {
  const s = getSettings();
  const { start, end } = monthBounds(month);
  const scheduled = s.next_paycheck_date ? paydaysInMonth(s.next_paycheck_date, s.pay_frequency, month) : [];
  const exact = db
    .prepare('SELECT id, amount, payday FROM paychecks WHERE payday BETWEEN ? AND ?')
    .all(start, end) as { id: number; amount: number; payday: string }[];
  const loose = db
    .prepare('SELECT id, amount, date FROM paychecks WHERE payday IS NULL AND date BETWEEN ? AND ? ORDER BY date, id')
    .all(start, end) as { id: number; amount: number; date: string }[];
  const used = new Set<number>();

  const paydays: Payday[] = scheduled.map((p) => {
    let match: { id: number; amount: number } | undefined = exact.find((c) => c.payday === p.date);
    if (!match) {
      let best: { id: number; amount: number; gap: number } | undefined;
      for (const c of loose) {
        if (used.has(c.id)) continue;
        const gap = Math.abs(differenceInCalendarDays(parseISO(c.date), parseISO(p.date)));
        if (gap <= PAYDAY_MATCH_DAYS && (!best || gap < best.gap)) best = { id: c.id, amount: c.amount, gap };
      }
      if (best) used.add(best.id);
      match = best;
    }
    return {
      date: p.date,
      kind: p.kind,
      expected: s.pay_amount ?? 0,
      paycheck: match ? { id: match.id, amount: match.amount } : null,
      snoozed: getMeta(`payday_snooze:${p.date}`) === todayIso,
    };
  });

  const scheduledDates = new Set(scheduled.map((p) => p.date));
  const adhoc =
    loose.filter((c) => !used.has(c.id)).reduce((sum, c) => sum + c.amount, 0) +
    exact.filter((c) => !scheduledDates.has(c.payday)).reduce((sum, c) => sum + c.amount, 0);
  return { paydays, adhoc };
}

/** Records (or corrects) the paycheck for a scheduled payday. */
export function confirmPayday(payday: string, amount: number): BudgetMonthView {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM paychecks WHERE payday = ?').get(payday) as
    | { id: number }
    | undefined;
  if (existing) {
    db.prepare('UPDATE paychecks SET amount = ? WHERE id = ?').run(Math.max(0, amount), existing.id);
  } else {
    db.prepare('INSERT INTO paychecks (date, amount, notes, payday) VALUES (?, ?, NULL, ?)').run(
      payday,
      Math.max(0, amount),
      payday
    );
  }
  // Keep "next paycheck" (desktop dashboard, payday reminder) pointing ahead.
  const s = getSettings();
  if (s.next_paycheck_date) {
    const t = today();
    updateSettings({ next_paycheck_date: nextPaydayAfter(s.next_paycheck_date, s.pay_frequency, payday > t ? payday : t) });
  }
  return budgetMonth(monthOf(payday));
}

/** "Not yet" — hide this payday's card until tomorrow. */
export function snoozePayday(payday: string): { ok: true } {
  setMeta(`payday_snooze:${payday}`, today());
  return { ok: true };
}

// ---------- The month view ----------

function monthRecurring(db: Db, month: string): BudgetMonthView['recurring'] {
  const { start, end } = monthBounds(month);
  const templates = db.prepare('SELECT * FROM recurring_expenses WHERE archived = 0').all() as RecurringExpense[];
  const logged = db
    .prepare(
      `SELECT id, description, amount, date, category_id, recurring_id FROM expenses
        WHERE date BETWEEN ? AND ? AND (recurring_id IS NOT NULL OR note = 'Recurring')`
    )
    .all(start, end) as {
    id: number;
    description: string;
    amount: number;
    date: string;
    category_id: number | null;
    recurring_id: number | null;
  }[];
  const loggedKeys = new Set(logged.map((e) => `${e.recurring_id}|${e.date}`));
  const emojiOf = new Map(
    (db.prepare('SELECT id, emoji FROM recurring_expenses').all() as { id: number; emoji: string | null }[]).map(
      (r) => [r.id, r.emoji]
    )
  );

  const items: RecurringOccurrence[] = [];
  for (const r of templates) {
    for (const date of occurrencesInRange(r.anchor_date, r.frequency, r.interval_count, start, end)) {
      items.push({
        recurring_id: r.id,
        description: r.description,
        emoji: r.emoji,
        amount: r.amount,
        date,
        category_id: r.category_id,
        logged: loggedKeys.has(`${r.id}|${date}`),
      });
    }
  }
  // Charges already logged this month whose template is now paused, edited or
  // deleted still came off the top — keep them in the fixed total.
  const itemKeys = new Set(items.map((i) => `${i.recurring_id}|${i.date}`));
  for (const e of logged) {
    if (itemKeys.has(`${e.recurring_id}|${e.date}`)) continue;
    items.push({
      recurring_id: e.recurring_id,
      description: e.description,
      emoji: e.recurring_id != null ? emojiOf.get(e.recurring_id) ?? null : null,
      amount: e.amount,
      date: e.date,
      category_id: e.category_id,
      logged: true,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
  return { items, total: r2(items.reduce((s, i) => s + i.amount, 0)) };
}

export function budgetMonth(month?: string): BudgetMonthView {
  const db = getDb();
  const todayIso = today();
  const currentMonth = monthOf(todayIso);
  const m = month ?? currentMonth;
  materializeRecurringExpenses();

  const existed = monthStatus(db, m) != null;
  const status = db.transaction(() => ensureBudgetMonth(db, m))() as MonthStatus;
  if (!existed && status === 'draft') mirrorSpendLinesToLegacyBudgets(db, m);

  const { start, end, days } = monthBounds(m);
  const todayDay = Number(todayIso.slice(8, 10));
  const daysLeft = m < currentMonth ? 0 : m > currentMonth ? days : days - todayDay + 1;
  const elapsed = m < currentMonth ? 1 : m > currentMonth ? 0 : todayDay / days;

  // Income
  const { paydays, adhoc } = monthPaydays(db, m, todayIso);
  const income = r2(
    paydays.reduce(
      (sum, p) => sum + (p.paycheck ? p.paycheck.amount : p.kind === 'regular' ? p.expected : 0),
      0
    ) + adhoc
  );
  const windowStart = formatISO(addDays(parseISO(todayIso), -14), { representation: 'date' });
  const recentMonths = [...new Set([monthOf(windowStart), currentMonth])];
  const pendingPaydays = recentMonths
    .flatMap((mm) => (mm === m ? paydays : monthPaydays(db, mm, todayIso).paydays))
    .filter((p) => !p.paycheck && !p.snoozed && p.date <= todayIso && p.date >= windowStart);

  const recurring = monthRecurring(db, m);

  // Plan lines, joined to what they point at.
  const categories = listExpenseCategories();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const rawLines = db
    .prepare('SELECT kind, ref_id, amount FROM budget_lines WHERE month = ? ORDER BY id')
    .all(m) as { kind: BudgetLineKind; ref_id: number; amount: number }[];

  const spentRows = db
    .prepare(
      `SELECT category_id, SUM(amount) AS spent FROM expenses
        WHERE date BETWEEN ? AND ? AND ${EVERYDAY}
        GROUP BY category_id`
    )
    .all(start, end) as { category_id: number | null; spent: number }[];
  const spentBy = new Map(spentRows.map((r) => [r.category_id, r2(r.spent)]));

  const spendRefs = new Set(rawLines.filter((l) => l.kind === 'spend').map((l) => l.ref_id));
  const spend: SpendLineView[] = categories
    .filter((c) => spendRefs.has(c.id))
    .map((c) => {
      const amount = rawLines.find((l) => l.kind === 'spend' && l.ref_id === c.id)!.amount;
      const spent = spentBy.get(c.id) ?? 0;
      return { category_id: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind, amount, spent, left: r2(amount - spent) };
    });

  const fund: FundLineView[] = [];
  const debt: DebtLineView[] = [];
  for (const l of rawLines) {
    if (l.kind === 'fund') {
      const g = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(l.ref_id) as SavingsGoal | undefined;
      if (g) {
        fund.push({ goal_id: g.id, name: g.name, emoji: g.emoji, color: g.color, amount: l.amount, balance: fundBalance(g.id, db), target: g.target_amount });
      }
    } else if (l.kind === 'debt') {
      const d = db.prepare('SELECT * FROM debts WHERE id = ?').get(l.ref_id) as Debt | undefined;
      if (d) debt.push({ debt_id: d.id, name: d.name, type: d.type, amount: l.amount, balance: d.current_balance });
    }
  }

  const sum = <T,>(xs: T[], f: (x: T) => number) => r2(xs.reduce((s, x) => s + f(x), 0));
  const planned = {
    spend: sum(spend, (l) => l.amount),
    fund: sum(fund, (l) => l.amount),
    debt: sum(debt, (l) => l.amount),
    needs: sum(spend.filter((l) => l.kind === 'need'), (l) => l.amount),
    wants: sum(spend.filter((l) => l.kind === 'want'), (l) => l.amount),
  };
  const spentNeeds = sum(spentRows.filter((r) => r.category_id != null && catById.get(r.category_id)?.kind === 'need'), (r) => r.spent);
  const spentTotal = sum(spentRows, (r) => r.spent);
  const spent = { total: spentTotal, needs: spentNeeds, wants: r2(spentTotal - spentNeeds) };
  const leftToSpend = r2(planned.spend - spent.total);

  const pace: PaceStatus =
    leftToSpend < 0
      ? 'over'
      : planned.spend > 0 && spent.total / planned.spend > elapsed + 0.1
        ? 'fast'
        : 'on_track';

  const unbudgeted = spentRows
    .filter((r) => r.spent > 0 && (r.category_id == null || !spendRefs.has(r.category_id)))
    .map((r) => {
      const c = r.category_id != null ? catById.get(r.category_id) : undefined;
      return {
        category_id: r.category_id,
        name: c?.name ?? 'Uncategorized',
        emoji: c?.emoji ?? '❔',
        color: c?.color ?? '#94a3b8',
        kind: c?.kind ?? ('want' as CategoryKind),
        spent: r2(r.spent),
      };
    })
    .sort((a, b) => b.spent - a.spent);

  return {
    month: m,
    status,
    today: todayIso,
    daysInMonth: days,
    daysLeft,
    paydays,
    pendingPaydays,
    income,
    recurring,
    lines: { spend, fund, debt },
    planned,
    leftToAllocate: r2(income - recurring.total - planned.debt - planned.fund - planned.spend),
    spent,
    leftToSpend,
    needsLeft: r2(planned.needs - spent.needs),
    wantsLeft: r2(planned.wants - spent.wants),
    safePerDay: daysLeft > 0 ? Math.max(0, leftToSpend) / daysLeft : 0,
    pace,
    wantsEatingNeeds: planned.needs > 0 && spent.wants > planned.wants && leftToSpend >= 0,
    unbudgeted,
  };
}

// ---------- Weekly report ----------

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

/** Everyday spending (see EVERYDAY) per day and per category, for one week. */
function weekTotals(db: Db, start: string) {
  const end = formatISO(addDays(parseISO(start), 6), { representation: 'date' });
  const rows = db
    .prepare(`SELECT date, category_id, amount FROM expenses WHERE date BETWEEN ? AND ? AND ${EVERYDAY}`)
    .all(start, end) as { date: string; category_id: number | null; amount: number }[];
  const byDay = new Map<string, number>();
  const byCat = new Map<number | null, number>();
  for (const r of rows) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amount);
    byCat.set(r.category_id, (byCat.get(r.category_id) ?? 0) + r.amount);
  }
  return { end, total: r2(rows.reduce((s, r) => s + r.amount, 0)), byDay, byCat };
}

/** Monday–Sunday recap. Defaults to the last full week. */
export function weeklyReport(weekStart?: string): WeeklyReport {
  const db = getDb();
  const start =
    weekStart ??
    formatISO(addDays(startOfWeek(parseISO(today()), { weekStartsOn: 1 }), -7), {
      representation: 'date',
    });
  const shift = (days: number) => formatISO(addDays(parseISO(start), days), { representation: 'date' });

  const cur = weekTotals(db, start);
  const prev = weekTotals(db, shift(-7));
  const weeks = [-21, -14, -7, 0].map((d) => ({ weekStart: shift(d), total: weekTotals(db, shift(d)).total }));

  let biggestDay: WeeklyReport['biggestDay'] = null;
  for (const [date, total] of cur.byDay) {
    if (!biggestDay || total > biggestDay.total) biggestDay = { date, total: r2(total) };
  }

  const cats = new Map(listExpenseCategories().map((c) => [c.id, c]));
  const byCategory = [...cur.byCat.entries()]
    .map(([id, total]) => {
      const c = id != null ? cats.get(id) : undefined;
      return {
        category_id: id,
        name: c?.name ?? 'Uncategorized',
        emoji: c?.emoji ?? '❔',
        color: c?.color ?? '#94a3b8',
        total: r2(total),
        previous: r2(prev.byCat.get(id) ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total);

  const fundsAdded = r2(
    (
      db
        .prepare(
          "SELECT COALESCE(SUM(amount), 0) AS v FROM fund_transactions WHERE kind = 'deposit' AND date BETWEEN ? AND ?"
        )
        .get(start, cur.end) as { v: number }
    ).v
  );

  const changePct = prev.total > 0 ? ((cur.total - prev.total) / prev.total) * 100 : null;

  // Plain-language observations built from the numbers — no AI.
  const insights: string[] = [];
  if (!biggestDay) {
    insights.push('No everyday spending logged this week.');
  } else {
    const dayCats = db
      .prepare(
        `SELECT category_id, SUM(amount) AS v FROM expenses WHERE date = ? AND ${EVERYDAY}
          GROUP BY category_id ORDER BY v DESC LIMIT 1`
      )
      .get(biggestDay.date) as { category_id: number | null; v: number } | undefined;
    const dayCat = dayCats?.category_id != null ? cats.get(dayCats.category_id)?.name : undefined;
    insights.push(
      `${format(parseISO(biggestDay.date), 'EEEE')} was your biggest day at ${cad.format(biggestDay.total)}` +
        (dayCat ? `, mostly ${dayCat.toLowerCase()}.` : '.')
    );
    const movers = byCategory.filter((c) => c.previous > 0 && Math.abs(c.total - c.previous) / c.previous >= 0.2);
    if (movers[0]) {
      const m = movers[0];
      insights.push(
        `${m.name} ${m.total > m.previous ? 'climbed' : 'dropped'} to ${cad.format(m.total)} from ${cad.format(m.previous)}.`
      );
    }
    if (movers[1]) insights.push(`${movers[1].name} also ${movers[1].total > movers[1].previous ? 'went up' : 'came down'}.`);
    if (changePct != null && changePct <= -10) {
      insights.push(`You spent ${Math.round(-changePct)}% less than last week — nice.`);
    }
  }
  if (fundsAdded > 0) insights.push(`You added ${cad.format(fundsAdded)} to your funds.`);

  return {
    weekStart: start,
    weekEnd: cur.end,
    total: cur.total,
    previousTotal: prev.total,
    changePct,
    dailyAverage: cur.total / 7,
    weeks,
    biggestDay,
    byCategory,
    fundsAdded,
    insights,
  };
}

// ---------- Import bills ----------

/**
 * Copies each active bill into a recurring template starting at its next due
 * date (so no history is generated). Bills stay untouched for the desktop.
 * Bills already imported (same name and amount) are skipped.
 */
export function importBillsAsRecurring(): { imported: number } {
  const existing = listRecurringExpenses(true);
  const billCats = new Map(listCategories().map((c) => [c.id, c.name.toLowerCase()]));
  const expenseCats = listExpenseCategories();
  const catByName = (name: string | undefined) =>
    name ? expenseCats.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null : null;
  const todayDate = parseISO(today());
  let imported = 0;

  for (const b of listBills()) {
    if (existing.some((r) => r.description.toLowerCase() === b.name.toLowerCase() && r.amount === b.amount)) continue;
    let frequency: RecurringFrequency = 'monthly';
    let interval = 1;
    switch (b.frequency) {
      case 'biweekly':
        frequency = 'weekly';
        interval = 2;
        break;
      case 'semi_annual':
        interval = 6;
        break;
      case 'yearly':
        frequency = 'yearly';
        break;
      case 'custom_days': {
        const n = Math.max(1, b.custom_days ?? 30);
        if (n % 7 === 0) {
          frequency = 'weekly';
          interval = n / 7;
        } else {
          interval = Math.max(1, Math.round(n / 30));
        }
        break;
      }
    }
    createRecurringExpense({
      description: b.name,
      amount: b.amount,
      category_id:
        catByName(b.category_id != null ? billCats.get(b.category_id) : undefined) ?? catByName(b.name),
      frequency,
      interval_count: interval,
      anchor_date: formatISO(nextDueOnOrAfter(b, todayDate), { representation: 'date' }),
    });
    imported++;
  }
  return { imported };
}

// ---------- Expense reports ----------
export function reportExpenses(fromIso: string, toIso: string): ExpenseReport {
  const db = getDb();

  const totals = db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expenses WHERE date BETWEEN ? AND ?'
    )
    .get(fromIso, toIso) as { total: number; count: number };

  const byCategory = db
    .prepare(
      `SELECT c.id, c.name, c.color, COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e
         LEFT JOIN expense_categories c ON c.id = e.category_id
        WHERE e.date BETWEEN ? AND ?
        GROUP BY c.id
        ORDER BY total DESC`
    )
    .all(fromIso, toIso) as {
    id: number | null;
    name: string | null;
    color: string | null;
    total: number;
  }[];

  const overTime = db
    .prepare(
      `SELECT strftime('%Y-%m', date) AS month, COALESCE(SUM(amount), 0) AS total
         FROM expenses
        WHERE date BETWEEN ? AND ?
        GROUP BY month
        ORDER BY month`
    )
    .all(fromIso, toIso) as { month: string; total: number }[];

  const topPurchases = db
    .prepare(
      `SELECT e.id, e.description, e.amount, e.date,
              c.name AS category_name, c.color AS category_color
         FROM expenses e
         LEFT JOIN expense_categories c ON c.id = e.category_id
        WHERE e.date BETWEEN ? AND ?
        ORDER BY e.amount DESC, e.date DESC
        LIMIT 8`
    )
    .all(fromIso, toIso) as {
    id: number;
    description: string;
    amount: number;
    date: string;
    category_name: string | null;
    category_color: string | null;
  }[];

  return {
    totalSpent: totals.total,
    count: totals.count,
    byCategory: byCategory.map((r) => ({
      id: r.id,
      name: r.name ?? 'Uncategorized',
      color: r.color ?? '#64748b',
      total: r.total,
    })),
    overTime,
    topPurchases: topPurchases.map((r) => ({
      id: r.id,
      description: r.description,
      amount: r.amount,
      date: r.date,
      categoryName: r.category_name ?? 'Uncategorized',
      categoryColor: r.category_color ?? '#64748b',
    })),
  };
}
