import { describe, it, expect } from 'vitest';
import {
  monthlyLine,
  monthsLeft,
  rrspDeadline,
  scheduleRows,
  suggestNewYear,
  taxYearFor,
  tfsaLimit,
  yearBounds,
} from '../../shared/registered';

describe('rrspDeadline / yearBounds / taxYearFor', () => {
  it('is the 60th day, moved off weekends', () => {
    expect(rrspDeadline(2025)).toBe('2026-03-02'); // Mar 1 2026 is a Sunday
    expect(rrspDeadline(2026)).toBe('2027-03-01'); // Monday
    expect(rrspDeadline(2027)).toBe('2028-02-29'); // leap year, Tuesday
  });
  it('bounds the CRA year by kind', () => {
    expect(yearBounds('tfsa', 2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(yearBounds('rrsp', 2026)).toEqual({ start: '2026-03-03', end: '2027-03-01' });
  });
  it('maps a date to its tax year', () => {
    expect(taxYearFor('rrsp', '2027-03-01')).toBe(2026);
    expect(taxYearFor('rrsp', '2027-03-02')).toBe(2027);
    expect(taxYearFor('rrsp', '2026-03-02')).toBe(2025);
    expect(taxYearFor('fhsa', '2026-11-08')).toBe(2026);
  });
});

describe('monthsLeft / monthlyLine', () => {
  it('counts months whose 1st is before the deadline', () => {
    expect(monthsLeft('2026-11', '2027-03-01')).toBe(4);
    expect(monthsLeft('2026-11', '2026-12-31')).toBe(2);
    expect(monthsLeft('2026-11', '2027-03-15')).toBe(5);
    expect(monthsLeft('2027-03', '2027-03-01')).toBe(0);
  });
  it('splits what is left', () => {
    expect(monthlyLine(6000, 3600, '2026-11', '2027-03-01')).toBe(600);
    expect(monthlyLine(7000, 5800, '2026-11', '2026-12-31')).toBe(600);
    expect(monthlyLine(6000, 6500, '2026-11', '2027-03-01')).toBe(0);
    expect(monthlyLine(6000, 0, '2027-03', '2027-03-01')).toBe(0);
  });
  it('last month absorbs rounding', () => {
    expect(monthlyLine(1000, 0, '2026-10', '2026-12-31')).toBe(333.33);
    expect(monthlyLine(1000, 333.33, '2026-11', '2026-12-31')).toBe(333.34);
    expect(monthlyLine(1000, 666.67, '2026-12', '2026-12-31')).toBe(333.33);
  });
});

describe('tfsaLimit', () => {
  it('knows published years and falls back to the latest for later ones', () => {
    expect(tfsaLimit(2026)).toEqual({ amount: 7000, known: true });
    expect(tfsaLimit(2027)).toEqual({ amount: 7000, known: false });
  });
});

describe('suggestNewYear', () => {
  const base = { goal: 7000, budgeted: true, lifetimeContributed: 0, lifetimeMaxReached: false };
  it('TFSA: unused room plus each new year limit', () => {
    expect(suggestNewYear({ ...base, kind: 'tfsa', room: 19500, contributed: 7000 }, 2026, 2027).room).toBe(19500);
    expect(suggestNewYear({ ...base, kind: 'tfsa', room: 10000, contributed: 0 }, 2025, 2027).room).toBe(24000);
  });
  it('FHSA: carry at most 8000, cap at the lifetime limit, checkbox wins', () => {
    const f = { ...base, kind: 'fhsa' as const, goal: 8000 };
    expect(suggestNewYear({ ...f, room: 8000, contributed: 6000 }, 2026, 2027).room).toBe(10000);
    expect(suggestNewYear({ ...f, room: 16000, contributed: 0 }, 2026, 2027).room).toBe(16000);
    expect(suggestNewYear({ ...f, room: 8000, contributed: 0, lifetimeContributed: 36000 }, 2026, 2027).room).toBe(4000);
    expect(suggestNewYear({ ...f, room: 8000, contributed: 0, lifetimeMaxReached: true }, 2026, 2027).room).toBe(0);
  });
  it('RRSP: room is left to the user; goal, deadline and switch carry over', () => {
    const s = suggestNewYear({ ...base, kind: 'rrsp', room: 14200, contributed: 6000, goal: 6000 }, 2026, 2027);
    expect(s).toEqual({ tax_year: 2027, room: null, goal: 6000, goal_deadline: '2028-02-29', budgeted: true });
  });
  it('caps the carried goal at the suggested room', () => {
    expect(
      suggestNewYear(
        { ...base, kind: 'fhsa', room: 8000, contributed: 0, goal: 8000, lifetimeContributed: 36000 },
        2026,
        2027
      ).goal
    ).toBe(4000);
  });
});

describe('scheduleRows', () => {
  it('reproduces the mockup RRSP year', () => {
    const rows = scheduleRows({
      yearStart: '2026-03-03',
      yearEnd: '2027-03-01',
      goalDeadline: '2027-03-01',
      goal: 6000,
      budgeted: true,
      deposits: [
        { date: '2026-03-20', amount: 1500 },
        { date: '2026-08-01', amount: 500 },
        { date: '2026-09-01', amount: 1000 },
        { date: '2026-10-01', amount: 600 },
        { date: '2026-11-03', amount: 350 },
      ],
      lines: { '2026-08': 642.86, '2026-09': 666.67, '2026-10': 600 },
      currentMonth: '2026-11',
      currentPlanned: 600,
    });
    expect(rows.map((r) => [r.month, r.state, r.planned, r.deposited])).toEqual([
      ['2026-03', 'past', null, 1500],
      ['2026-08', 'past', 642.86, 500],
      ['2026-09', 'past', 666.67, 1000],
      ['2026-10', 'past', 600, 600],
      ['2026-11', 'current', 600, 350],
      ['2026-12', 'future', 600, 0],
      ['2027-01', 'future', 600, 0],
      ['2027-02', 'future', 600, 0],
    ]);
  });
  it('drops future months after an early deadline', () => {
    const rows = scheduleRows({
      yearStart: '2026-01-01',
      yearEnd: '2026-12-31',
      goalDeadline: '2026-06-30',
      goal: 6000,
      budgeted: true,
      deposits: [],
      lines: {},
      currentMonth: '2026-05',
      currentPlanned: 3000,
    });
    expect(rows.map((r) => r.month)).toEqual(['2026-05', '2026-06']);
  });
});
