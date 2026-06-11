import { getDb } from './index';
import type {
  AppSettings,
  Bill,
  BillInput,
  BillMonthItem,
  Category,
  DashboardSnapshot,
  Debt,
  DebtInput,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseReport,
  Paycheck,
  PaycheckAllocationInput,
  PaycheckWithAllocations,
  SavingsGoal,
  SavingsGoalInput,
} from '../../shared/types';
import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  formatISO,
  getDaysInMonth,
  parseISO,
  startOfMonth,
  endOfMonth,
} from 'date-fns';

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
  return {
    theme: (map.theme as 'light' | 'dark') || 'dark',
    pay_cadence: 'biweekly',
    next_paycheck_date: map.next_paycheck_date || null,
    accent_color: accent,
    user_name: map.user_name?.trim() || 'Kevin',
  };
}

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

// ---------- Goals ----------
export function listGoals(): SavingsGoal[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM savings_goals WHERE archived = 0 ORDER BY name')
    .all() as SavingsGoal[];
  const contribStmt = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM paycheck_allocations WHERE kind = 'goal' AND ref_id = ?"
  );
  return rows.map((g) => {
    const r = contribStmt.get(g.id) as { total: number };
    return { ...g, current_amount: r.total };
  });
}

export function createGoal(input: SavingsGoalInput): SavingsGoal {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO savings_goals (name, target_amount, target_date, color)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.name, input.target_amount, input.target_date ?? null, input.color);
  const g = db
    .prepare('SELECT * FROM savings_goals WHERE id = ?')
    .get(info.lastInsertRowid) as SavingsGoal;
  return { ...g, current_amount: 0 };
}

export function updateGoal(id: number, input: Partial<SavingsGoalInput>): SavingsGoal {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as SavingsGoal;
  if (!cur) throw new Error('Goal not found');
  db.prepare(
    'UPDATE savings_goals SET name = ?, target_amount = ?, target_date = ?, color = ? WHERE id = ?'
  ).run(
    input.name ?? cur.name,
    input.target_amount ?? cur.target_amount,
    input.target_date ?? cur.target_date,
    input.color ?? cur.color,
    id
  );
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM paycheck_allocations WHERE kind = 'goal' AND ref_id = ?"
    )
    .get(id) as { total: number };
  const next = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as SavingsGoal;
  return { ...next, current_amount: r.total };
}

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
  const contribStmt = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM paycheck_allocations WHERE kind = 'goal' AND ref_id = ?"
  );
  return rows.map((g) => {
    const r = contribStmt.get(g.id) as { total: number };
    return { ...g, current_amount: r.total };
  });
}

/**
 * Permanently remove a goal from the database. Past paycheck allocations that
 * referenced this goal stay intact (their `kind='goal'` row remains) so the
 * historical Savings totals on each paycheck don't change — they just no
 * longer point at a named goal.
 */
export function hardDeleteGoal(id: number): { ok: true } {
  getDb().prepare('DELETE FROM savings_goals WHERE id = ?').run(id);
  return { ok: true };
}

export function restoreGoal(id: number): SavingsGoal | null {
  const db = getDb();
  db.prepare('UPDATE savings_goals SET archived = 0, archived_at = NULL WHERE id = ?').run(id);
  const cur = db.prepare('SELECT * FROM savings_goals WHERE id = ?').get(id) as
    | SavingsGoal
    | undefined;
  if (!cur) return null;
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM paycheck_allocations WHERE kind = 'goal' AND ref_id = ?"
    )
    .get(id) as { total: number };
  return { ...cur, current_amount: r.total };
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
    while (formatISO(next, { representation: 'date' }) <= todayStr && guard++ < 600) {
      balance = Math.round(balance * (1 + d.interest_rate / 100 / 12) * 100) / 100;
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
  getDb().prepare('DELETE FROM debts WHERE id = ?').run(id);
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
    .prepare('SELECT * FROM expense_categories ORDER BY name')
    .all() as ExpenseCategory[];
}

export function createExpenseCategory(input: { name: string; color: string }): ExpenseCategory {
  const db = getDb();
  const info = db
    .prepare('INSERT INTO expense_categories (name, color) VALUES (?, ?)')
    .run(input.name, input.color);
  return db
    .prepare('SELECT * FROM expense_categories WHERE id = ?')
    .get(info.lastInsertRowid) as ExpenseCategory;
}

export function updateExpenseCategory(
  id: number,
  input: { name?: string; color?: string }
): ExpenseCategory {
  const db = getDb();
  const cur = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategory;
  if (!cur) throw new Error('Expense category not found');
  db.prepare('UPDATE expense_categories SET name = ?, color = ? WHERE id = ?').run(
    input.name ?? cur.name,
    input.color ?? cur.color,
    id
  );
  return db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id) as ExpenseCategory;
}

export function deleteExpenseCategory(id: number): { ok: true } {
  // ON DELETE SET NULL keeps the expenses but clears their category.
  getDb().prepare('DELETE FROM expense_categories WHERE id = ?').run(id);
  return { ok: true };
}

// ---------- Expenses ----------
export function listExpenses(): Expense[] {
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

export function createExpense(input: ExpenseInput): Expense {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (description, amount, date, category_id, note, debt_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.description,
        input.amount,
        input.date,
        input.category_id ?? null,
        input.note ?? null,
        input.debt_id ?? null
      );
    if (input.debt_id != null && input.amount > 0) chargeDebt(db, input.debt_id, input.amount);
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
    const nextDebtId = input.debt_id === undefined ? cur.debt_id : input.debt_id;
    const nextAmount = input.amount ?? cur.amount;
    // Reverse the old charge, apply the new one (covers amount and card changes).
    if (cur.debt_id != null && cur.amount > 0) unchargeDebt(db, cur.debt_id, cur.amount);
    if (nextDebtId != null && nextAmount > 0) chargeDebt(db, nextDebtId, nextAmount);
    db.prepare(
      `UPDATE expenses SET description = ?, amount = ?, date = ?, category_id = ?, note = ?, debt_id = ?
         WHERE id = ?`
    ).run(
      input.description ?? cur.description,
      nextAmount,
      input.date ?? cur.date,
      input.category_id === undefined ? cur.category_id : input.category_id,
      input.note === undefined ? cur.note : input.note,
      nextDebtId,
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
