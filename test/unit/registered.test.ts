import { describe, it, expect } from 'vitest';
import {
  depositEffect,
  monthlyLine,
  splitPreview,
  monthsLeft,
  overRoomBy,
  planStatus,
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

describe('splitPreview', () => {
  const deposits = [{ date: '2026-03-20', amount: 3600 }, { date: '2026-11-03', amount: 300 }];
  it('starts this month while it is still a draft', () => {
    expect(splitPreview({ goal: 6000, deposits, yearStart: '2026-03-03', currentMonth: '2026-11', currentConfirmed: false, deadline: '2027-03-01' }))
      .toEqual({ perMonth: 600, from: '2026-11', months: 4 });
  });
  it('starts next month once this month is confirmed, counting this month’s deposits', () => {
    expect(splitPreview({ goal: 6000, deposits, yearStart: '2026-03-03', currentMonth: '2026-11', currentConfirmed: true, deadline: '2027-03-01' }))
      .toEqual({ perMonth: 700, from: '2026-12', months: 3 });
  });
});

describe('overRoomBy', () => {
  it('is null at or under the room', () => {
    expect(overRoomBy('tfsa', 7000, 7000)).toBeNull();
    expect(overRoomBy('rrsp', 14200, 9000)).toBeNull();
  });
  it('lets an RRSP go $2,000 over with nothing taxed', () => {
    expect(overRoomBy('rrsp', 10000, 11500)).toEqual({ over: 1500, taxed: 0 });
    expect(overRoomBy('rrsp', 10000, 12000)).toEqual({ over: 2000, taxed: 0 });
  });
  it('taxes only the RRSP part above the buffer', () => {
    expect(overRoomBy('rrsp', 10000, 12600.5)).toEqual({ over: 2600.5, taxed: 600.5 });
  });
  it('taxes the whole TFSA and FHSA excess', () => {
    expect(overRoomBy('tfsa', 7000, 7500)).toEqual({ over: 500, taxed: 500 });
    expect(overRoomBy('fhsa', 8000, 8100)).toEqual({ over: 100, taxed: 100 });
  });
});

describe('depositEffect', () => {
  // The RRSP from the budget tests: $6,000 goal, $3,600 already in → $600 a month
  // Nov–Feb. These numbers match "an extra deposit lowers next month" (466.67)
  // and "a short month raises the next" (700) in the repo contract.
  const base = {
    goal: 6000,
    budgeted: true,
    deposits: [{ date: '2026-03-01', amount: 3600 }],
    yearStart: '2026-03-02',
    yearEnd: '2027-03-01',
    deadline: '2027-03-01',
    currentMonth: '2026-11',
    currentPlanned: 600,
    date: '2026-11-05',
  };
  it('an extra deposit lowers the months ahead', () => {
    expect(depositEffect({ ...base, deposits: [{ date: '2026-04-01', amount: 3600 }], amount: 1000 })).toMatchObject({
      from: '2026-12',
      before: 600,
      after: 466.67,
    });
  });
  it('a short deposit raises them', () => {
    expect(depositEffect({ ...base, deposits: [{ date: '2026-04-01', amount: 3600 }], amount: 300 })).toMatchObject({
      before: 600,
      after: 700,
    });
  });
  it('reports a goal met once the deposit covers what is left', () => {
    expect(depositEffect({ ...base, deposits: [{ date: '2026-04-01', amount: 3600 }], amount: 2400 })?.after).toBe(0);
  });
  it('treats what is already in this month as part of its plan', () => {
    // 350 already in of 600; logging 250 completes the plan, so nothing moves.
    const e = depositEffect({
      ...base,
      deposits: [{ date: '2026-04-01', amount: 3600 }, { date: '2026-11-03', amount: 350 }],
      amount: 250,
    });
    expect(e?.before).toBe(e?.after);
  });
  it('has nothing to say without a monthly split, outside the year, or after the deadline', () => {
    const d = [{ date: '2026-04-01', amount: 3600 }];
    expect(depositEffect({ ...base, deposits: d, budgeted: false, amount: 100 })).toBeNull();
    expect(depositEffect({ ...base, deposits: d, goal: null, amount: 100 })).toBeNull();
    expect(depositEffect({ ...base, deposits: d, amount: 0 })).toBeNull();
    expect(depositEffect({ ...base, deposits: d, date: '2027-03-02', amount: 100 })).toBeNull();
    expect(depositEffect({ ...base, deposits: d, deadline: '2026-11-30', amount: 100 })).toBeNull();
  });
});

describe('planStatus', () => {
  const a = { budgeted: true, goal: 6000, contributed: 1000, monthly_plan: 500 as number | null };
  it('names why there is no monthly amount', () => {
    expect(planStatus(a)).toBe('monthly');
    expect(planStatus({ ...a, budgeted: false })).toBe('not_budgeted');
    expect(planStatus({ ...a, goal: null })).toBe('no_goal');
    expect(planStatus({ ...a, goal: 0 })).toBe('no_goal');
    expect(planStatus({ ...a, monthly_plan: null, contributed: 6000 })).toBe('goal_met');
    expect(planStatus({ ...a, monthly_plan: null, contributed: 1000 })).toBe('past_deadline');
  });
});
