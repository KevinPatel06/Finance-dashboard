import { describe, it, expect } from 'vitest';
import {
  latestOccurrenceOnOrBefore,
  nthOccurrence,
  occurrencesInRange,
} from '../../shared/recurrence';

describe('recurrence', () => {
  it('keeps a month-end anchor on the month end instead of drifting', () => {
    expect(occurrencesInRange('2026-01-31', 'monthly', 1, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('steps by an interval of months', () => {
    expect(occurrencesInRange('2026-02-15', 'monthly', 6, '2026-01-01', '2027-03-01')).toEqual([
      '2026-02-15',
      '2026-08-15',
      '2027-02-15',
    ]);
  });

  it('treats every-2-weeks and biweekly alike', () => {
    expect(occurrencesInRange('2026-10-05', 'weekly', 2, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05',
      '2026-10-19',
    ]);
    expect(occurrencesInRange('2026-10-05', 'biweekly', 1, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05',
      '2026-10-19',
    ]);
  });

  it('never returns dates before the anchor', () => {
    expect(occurrencesInRange('2026-06-01', 'monthly', 1, '2026-01-01', '2026-05-31')).toEqual([]);
  });

  it('starts mid-series when the window starts after the anchor', () => {
    expect(occurrencesInRange('2026-01-10', 'yearly', 1, '2027-01-01', '2028-12-31')).toEqual([
      '2027-01-10',
      '2028-01-10',
    ]);
  });

  it('computes the nth occurrence from the anchor', () => {
    expect(nthOccurrence('2026-01-31', 'monthly', 1, 1)).toBe('2026-02-28');
    expect(nthOccurrence('2026-01-31', 'monthly', 1, 2)).toBe('2026-03-31');
  });

  it('finds the latest occurrence on or before a date', () => {
    expect(latestOccurrenceOnOrBefore('2026-01-31', 'monthly', 1, '2026-03-15')).toBe('2026-02-28');
    expect(latestOccurrenceOnOrBefore('2026-01-31', 'monthly', 1, '2026-03-31')).toBe('2026-03-31');
    expect(latestOccurrenceOnOrBefore('2026-05-01', 'weekly', 1, '2026-04-30')).toBeNull();
  });
});
