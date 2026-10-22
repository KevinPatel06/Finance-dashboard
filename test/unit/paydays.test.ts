import { describe, it, expect } from 'vitest';
import {
  addMonthsToMonth,
  guaranteedPerMonth,
  monthBounds,
  monthOf,
  nextPaydayAfter,
  paydaysInMonth,
} from '../../shared/paydays';

describe('paydaysInMonth', () => {
  it('lists the biweekly paydays in a month', () => {
    expect(paydaysInMonth('2026-10-09', 'biweekly', '2026-10')).toEqual([
      { date: '2026-10-09', kind: 'regular' },
      { date: '2026-10-23', kind: 'regular' },
    ]);
  });

  it('walks backwards when the anchor is after the month', () => {
    expect(paydaysInMonth('2026-11-06', 'biweekly', '2026-10').map((p) => p.date)).toEqual([
      '2026-10-09',
      '2026-10-23',
    ]);
  });

  it('marks the third biweekly payday of a month as a bonus', () => {
    expect(paydaysInMonth('2026-10-09', 'biweekly', '2027-01')).toEqual([
      { date: '2027-01-01', kind: 'regular' },
      { date: '2027-01-15', kind: 'regular' },
      { date: '2027-01-29', kind: 'bonus' },
    ]);
  });

  it('clamps a monthly payday on the 31st to short months', () => {
    expect(paydaysInMonth('2026-01-31', 'monthly', '2026-02')).toEqual([
      { date: '2026-02-28', kind: 'regular' },
    ]);
    expect(paydaysInMonth('2026-01-31', 'monthly', '2026-03')).toEqual([
      { date: '2026-03-31', kind: 'regular' },
    ]);
  });

  it('pays semi-monthly on the 15th and the last day', () => {
    expect(paydaysInMonth('2026-10-15', 'semi_monthly', '2026-02').map((p) => p.date)).toEqual([
      '2026-02-15',
      '2026-02-28',
    ]);
  });

  it('marks the fifth weekly payday as a bonus', () => {
    expect(paydaysInMonth('2026-10-02', 'weekly', '2026-10').map((p) => p.kind)).toEqual([
      'regular',
      'regular',
      'regular',
      'regular',
      'bonus',
    ]);
  });
});

describe('nextPaydayAfter', () => {
  it('returns the first payday strictly after a date', () => {
    expect(nextPaydayAfter('2026-10-09', 'biweekly', '2026-10-22')).toBe('2026-10-23');
    expect(nextPaydayAfter('2026-10-09', 'biweekly', '2026-10-23')).toBe('2026-11-06');
    expect(nextPaydayAfter('2026-01-31', 'monthly', '2026-02-28')).toBe('2026-03-31');
    expect(nextPaydayAfter('2026-10-15', 'semi_monthly', '2026-10-15')).toBe('2026-10-31');
  });
});

describe('month helpers', () => {
  it('counts the paychecks every month is guaranteed', () => {
    expect(guaranteedPerMonth('weekly')).toBe(4);
    expect(guaranteedPerMonth('biweekly')).toBe(2);
    expect(guaranteedPerMonth('semi_monthly')).toBe(2);
    expect(guaranteedPerMonth('monthly')).toBe(1);
  });

  it('gives month bounds including leap years', () => {
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29', days: 29 });
    expect(monthBounds('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31', days: 31 });
  });

  it('adds months across a year boundary', () => {
    expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToMonth('2027-01', -1)).toBe('2026-12');
    expect(monthOf('2026-10-22')).toBe('2026-10');
  });
});
