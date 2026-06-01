import { getDb } from './index';
import type {
  AppSettings,
  Bill,
  BillInput,
  Category,
  DashboardSnapshot,
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
    db.prepare('DELETE FROM paycheck_allocations WHERE paycheck_id = ?').run(id);
    const insertAlloc = db.prepare(
      `INSERT INTO paycheck_allocations (paycheck_id, kind, ref_id, amount, note)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const a of input.allocations) {
      insertAlloc.run(id, a.kind, a.ref_id, a.amount, a.note ?? null);
    }
  });
  tx();
  return getPaycheck(id)!;
}

export function deletePaycheck(id: number): { ok: true } {
  getDb().prepare('DELETE FROM paychecks WHERE id = ?').run(id);
  return { ok: true };
}

function computeTotals(amount: number, allocs: { kind: string; amount: number }[]) {
  const t = { bills: 0, goals: 0, fun: 0, other: 0 };
  for (const a of allocs) {
    if (a.kind === 'bill') t.bills += a.amount;
    else if (a.kind === 'goal') t.goals += a.amount;
    else if (a.kind === 'fun') t.fun += a.amount;
    else t.other += a.amount;
  }
  const allocated = t.bills + t.goals + t.fun + t.other;
  return { ...t, allocated, remainder: amount - allocated };
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

  const horizon = addDays(todayDate, 30);
  const upcoming = upcomingBills(todayIso, formatISO(horizon, { representation: 'date' })).slice(
    0,
    8
  );

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
    upcomingBills: upcoming,
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
