import { addDays, addMonths, format, getDay, parseISO } from 'date-fns';
import type { NewYearSuggestion, RegisteredKind, RegisteredScheduleRow } from './types';

/**
 * CRA rules for RRSP / TFSA / FHSA, as researched 2026-11-08. Pure and
 * dependency-free (date-fns only) so the repo, the phone UI and the tests all
 * read the same numbers — a new year's limit is a one-line change here.
 *
 * Dates are ISO 'YYYY-MM-DD', months 'YYYY-MM'.
 */

export const TFSA_LIMITS: Record<number, number> = {
  2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500, 2014: 5500, 2015: 10000,
  2016: 5500, 2017: 5500, 2018: 5500, 2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
  2023: 6500, 2024: 7000, 2025: 7000, 2026: 7000,
};
export const FHSA_ANNUAL = 8000;
export const FHSA_CARRY_MAX = 8000;
export const FHSA_LIFETIME = 40000;
export const RRSP_BUFFER = 2000;
/** Hint text only — the user's real room comes from their Notice of Assessment. */
export const RRSP_DOLLAR_LIMITS: Record<number, number> = { 2026: 33810, 2027: 35390 };

/**
 * How far deposits are past the room, and how much of that CRA charges 1% a
 * month on. An RRSP may go $2,000 over with no charge, so only what's above
 * that buffer is taxed; TFSA and FHSA are taxed on the whole excess.
 */
export function overRoomBy(
  kind: RegisteredKind,
  room: number,
  contributed: number
): { over: number; taxed: number } | null {
  const over = Math.round((contributed - room) * 100) / 100;
  if (over <= 0) return null;
  const taxed = kind === 'rrsp' ? Math.max(0, Math.round((over - RRSP_BUFFER) * 100) / 100) : over;
  return { over, taxed };
}

export type PlanStatus = 'monthly' | 'goal_met' | 'no_goal' | 'not_budgeted' | 'past_deadline';

/** Why an account has (or has no) monthly amount, so the UI and export say the right thing. */
export function planStatus(a: {
  budgeted: boolean | number;
  goal: number | null;
  contributed: number;
  monthly_plan: number | null;
}): PlanStatus {
  if (!a.budgeted) return 'not_budgeted';
  if (a.goal == null || a.goal <= 0) return 'no_goal';
  if (a.monthly_plan != null && a.monthly_plan > 0) return 'monthly';
  return a.contributed >= a.goal ? 'goal_met' : 'past_deadline';
}

/** Plain words for each status that has no monthly amount. */
export const PLAN_STATUS_LABEL: Record<Exclude<PlanStatus, 'monthly'>, string> = {
  goal_met: 'Goal met',
  no_goal: 'No goal set',
  not_budgeted: 'Not budgeted',
  past_deadline: 'Deadline passed',
};

export const KIND_LABEL: Record<RegisteredKind, string> = { rrsp: 'RRSP', tfsa: 'TFSA', fhsa: 'FHSA' };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const monthStart = (m: string) => `${m}-01`;
const nextMonth = (m: string) => format(addMonths(parseISO(monthStart(m)), 1), 'yyyy-MM');
const cents = (n: number) => Math.round(n * 100);

/** The 60th day of the year after `taxYear`, moved to Monday when it lands on a weekend. */
export function rrspDeadline(taxYear: number): string {
  let d = addDays(new Date(taxYear + 1, 0, 1), 59);
  const dow = getDay(d);
  if (dow === 6) d = addDays(d, 2);
  else if (dow === 0) d = addDays(d, 1);
  return iso(d);
}

/** The CRA year itself: calendar year for TFSA/FHSA, deadline-to-deadline for the RRSP. */
export function yearBounds(kind: RegisteredKind, taxYear: number): { start: string; end: string } {
  if (kind !== 'rrsp') return { start: `${taxYear}-01-01`, end: `${taxYear}-12-31` };
  return { start: iso(addDays(parseISO(rrspDeadline(taxYear - 1)), 1)), end: rrspDeadline(taxYear) };
}

export function taxYearFor(kind: RegisteredKind, dateIso: string): number {
  const y = Number(dateIso.slice(0, 4));
  if (kind !== 'rrsp') return y;
  return dateIso <= rrspDeadline(y - 1) ? y - 1 : y;
}

export function defaultDeadline(kind: RegisteredKind, taxYear: number): string {
  return yearBounds(kind, taxYear).end;
}

/** Months from `fromMonth` on whose 1st falls before `deadline`. */
export function monthsLeft(fromMonth: string, deadline: string): number {
  let n = 0;
  for (let m = fromMonth; monthStart(m) < deadline; m = nextMonth(m)) n++;
  return n;
}

/** This month's share of what's left of the goal, to the cent. The last month absorbs rounding. */
export function monthlyLine(goal: number, contributedBefore: number, fromMonth: string, deadline: string): number {
  const n = monthsLeft(fromMonth, deadline);
  const rem = cents(goal) - cents(contributedBefore);
  if (n <= 0 || rem <= 0) return 0;
  return Math.round(rem / n) / 100;
}

/**
 * The add/edit form's "$X a month · Nov – Feb" preview. A confirmed month's
 * plan is fixed, so budgeting then starts next month and this month's
 * deposits already count toward the goal.
 */
export function splitPreview(input: {
  goal: number;
  deposits: { date: string; amount: number }[];
  yearStart: string;
  currentMonth: string;
  currentConfirmed: boolean;
  deadline: string;
}): { perMonth: number; from: string; months: number } {
  const from = input.currentConfirmed ? nextMonth(input.currentMonth) : input.currentMonth;
  const before = input.deposits
    .filter((d) => d.date >= input.yearStart && d.date < monthStart(from))
    .reduce((s, d) => s + d.amount, 0);
  return {
    perMonth: monthlyLine(input.goal, before, from, input.deadline),
    from,
    months: monthsLeft(from, input.deadline),
  };
}

/**
 * What logging a deposit does to the months ahead, for the deposit sheet. A
 * month's line counts deposits dated before it, so the first month to change
 * is the one after the deposit — or next month when the deposit is dated in
 * the past. Uses `monthlyLine`, the same rule the budget plans with.
 * Null when there's no monthly split to change.
 */
export function depositEffect(input: {
  goal: number | null;
  budgeted: boolean;
  deposits: { date: string; amount: number }[];
  yearStart: string;
  yearEnd: string;
  deadline: string;
  currentMonth: string;
  /** This month's planned line; "before" assumes it gets deposited in full, as the budget does. */
  currentPlanned: number;
  date: string;
  amount: number;
}): { from: string; months: number; before: number; after: number } | null {
  if (!input.budgeted || !input.goal || input.goal <= 0 || !(input.amount > 0)) return null;
  if (input.date < input.yearStart || input.date > input.yearEnd) return null;
  const afterDeposit = nextMonth(input.date.slice(0, 7));
  const nextCurrent = nextMonth(input.currentMonth);
  const from = afterDeposit > nextCurrent ? afterDeposit : nextCurrent;
  const months = monthsLeft(from, input.deadline);
  if (months <= 0) return null;
  const sumBefore = (extra: { date: string; amount: number }[]) =>
    [...input.deposits, ...extra]
      .filter((d) => d.date >= input.yearStart && d.date < monthStart(from))
      .reduce((s, d) => s + d.amount, 0);
  // What this month's plan still asks for, assumed deposited in the baseline.
  const inCurrent = input.deposits
    .filter((d) => d.date.slice(0, 7) === input.currentMonth && d.date >= input.yearStart)
    .reduce((s, d) => s + d.amount, 0);
  const topUp = { date: monthStart(input.currentMonth), amount: Math.max(0, input.currentPlanned - inCurrent) };
  return {
    from,
    months,
    before: monthlyLine(input.goal, sumBefore([topUp]), from, input.deadline),
    after: monthlyLine(input.goal, sumBefore([{ date: input.date, amount: input.amount }]), from, input.deadline),
  };
}

export function tfsaLimit(year: number): { amount: number; known: boolean } {
  if (TFSA_LIMITS[year] != null) return { amount: TFSA_LIMITS[year], known: true };
  const years = Object.keys(TFSA_LIMITS).map(Number);
  const latest = Math.max(...years);
  return { amount: year > latest ? TFSA_LIMITS[latest] : 0, known: false };
}

export function suggestNewYear(
  last: {
    kind: RegisteredKind;
    room: number;
    contributed: number;
    goal: number | null;
    budgeted: boolean;
    /** FHSA: deposits dated before the new year starts (the cap counts only those). */
    lifetimeContributed: number;
    lifetimeMaxReached: boolean;
    /** Deposits dated in years skipped while waiting; they used up that room. */
    skippedContributed?: number;
  },
  lastTaxYear: number,
  newTaxYear: number
): NewYearSuggestion {
  const unused = Math.max(0, last.room - last.contributed);
  const usedWhileSkipped = last.skippedContributed ?? 0;
  let room: number | null;
  if (last.kind === 'tfsa') {
    room = unused - usedWhileSkipped;
    for (let y = lastTaxYear + 1; y <= newTaxYear; y++) room += tfsaLimit(y).amount;
    room = Math.max(0, room);
  } else if (last.kind === 'fhsa') {
    const skipped = Math.max(0, newTaxYear - lastTaxYear - 1);
    const carry = Math.min(FHSA_CARRY_MAX, Math.max(0, unused + FHSA_ANNUAL * skipped - usedWhileSkipped));
    room = last.lifetimeMaxReached
      ? 0
      : Math.max(0, Math.min(carry + FHSA_ANNUAL, FHSA_LIFETIME - last.lifetimeContributed));
  } else {
    room = null;
  }
  const goal = last.goal != null && room != null ? Math.min(last.goal, room) : last.goal;
  return {
    tax_year: newTaxYear,
    room,
    goal,
    goal_deadline: defaultDeadline(last.kind, newTaxYear),
    budgeted: last.budgeted,
  };
}

/**
 * The account screen's "By month": past months show the stored plan line vs.
 * deposits, the current month its plan vs. deposits, and future months (up to
 * the goal deadline) the even split of what's left — assuming this month's
 * line gets deposited in full, or what's been deposited if that's more.
 */
export function scheduleRows(input: {
  yearStart: string;
  yearEnd: string;
  goalDeadline: string;
  goal: number | null;
  budgeted: boolean;
  deposits: { date: string; amount: number }[];
  lines: Record<string, number>;
  currentMonth: string;
  currentPlanned: number;
}): RegisteredScheduleRow[] {
  const { currentMonth } = input;
  const depositedIn = (m: string) =>
    cents(input.deposits.filter((d) => d.date.slice(0, 7) === m).reduce((s, d) => s + d.amount, 0)) / 100;

  const months: string[] = [];
  for (let m = input.yearStart.slice(0, 7); m <= input.yearEnd.slice(0, 7); m = nextMonth(m)) months.push(m);

  const rows: RegisteredScheduleRow[] = [];
  for (const m of months) {
    if (m >= currentMonth) break;
    const planned = input.lines[m] ?? null;
    const deposited = depositedIn(m);
    if (planned == null && deposited === 0) continue;
    rows.push({ month: m, planned, deposited, state: 'past' });
  }
  if (months.includes(currentMonth)) {
    rows.push({ month: currentMonth, planned: input.currentPlanned, deposited: depositedIn(currentMonth), state: 'current' });
  }

  const future = months.filter((m) => m > currentMonth && monthStart(m) < input.goalDeadline);
  if (!input.budgeted || input.goal == null || future.length === 0) return rows;

  const before = input.deposits
    .filter((d) => d.date < monthStart(currentMonth))
    .reduce((s, d) => s + d.amount, 0);
  const thisMonth = months.includes(currentMonth) ? Math.max(input.currentPlanned, depositedIn(currentMonth)) : 0;
  let rem = Math.max(0, cents(input.goal) - cents(before) - cents(thisMonth));
  future.forEach((m, i) => {
    const share = Math.round(rem / (future.length - i));
    rem -= share;
    rows.push({ month: m, planned: share / 100, deposited: 0, state: 'future' });
  });
  return rows;
}
