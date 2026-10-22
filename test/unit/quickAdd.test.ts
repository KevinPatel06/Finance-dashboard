import { describe, it, expect } from 'vitest';
import { parseQuickAdd, type QuickAddContext } from '../../shared/quickAdd';

// 2026-10-22 is a Thursday.
const ctx: QuickAddContext = {
  today: '2026-10-22',
  categories: [
    { id: 1, name: 'Groceries' },
    { id: 2, name: 'Dining' },
    { id: 3, name: 'Gas' },
    { id: 4, name: 'Transport' },
    { id: 9, name: 'Other' },
  ],
  history: [{ description: 'Esso', category_id: 3 }],
};

describe('parseQuickAdd', () => {
  it('splits a sentence into several expenses with guessed categories', () => {
    expect(parseQuickAdd('coffee 5, gas 50', ctx)).toMatchObject([
      { description: 'Coffee', amount: 5, date: '2026-10-22', category_id: 2 },
      { description: 'Gas', amount: 50, date: '2026-10-22', category_id: 3 },
    ]);
  });

  it('learns categories from history and reads "yesterday"', () => {
    expect(parseQuickAdd('Esso 40 yesterday', ctx)[0]).toMatchObject({
      description: 'Esso',
      amount: 40,
      date: '2026-10-21',
      category_id: 3,
    });
  });

  it('reads dollar amounts with thousands separators', () => {
    expect(parseQuickAdd('$1,234.56 rent', ctx)[0]).toMatchObject({
      amount: 1234.56,
      description: 'Rent',
    });
  });

  it('takes the last standalone number when there is no dollar sign', () => {
    expect(parseQuickAdd('7-eleven 12', ctx)[0]).toMatchObject({ description: '7-eleven', amount: 12 });
    expect(parseQuickAdd('2 coffees 9', ctx)[0]).toMatchObject({ description: '2 coffees', amount: 9 });
  });

  it('prefers a $ token over a later bare number', () => {
    expect(parseQuickAdd('$15 gift for 2', ctx)[0]).toMatchObject({ amount: 15, description: 'Gift for 2' });
  });

  it('reads weekday names as the most recent such day', () => {
    expect(parseQuickAdd('uber 18.40 monday', ctx)[0]).toMatchObject({
      date: '2026-10-19',
      amount: 18.4,
      category_id: 4,
    });
    expect(parseQuickAdd('lunch 9 thursday', ctx)[0].date).toBe('2026-10-22');
  });

  it('reads "N days ago" without taking N as the amount', () => {
    expect(parseQuickAdd('lunch 12 3 days ago', ctx)[0]).toMatchObject({ date: '2026-10-19', amount: 12 });
  });

  it('reads month-day dates without taking the day as the amount', () => {
    expect(parseQuickAdd('no frills 41.15 oct 3', ctx)[0]).toMatchObject({
      date: '2026-10-03',
      amount: 41.15,
      category_id: 1,
      description: 'No frills',
    });
    expect(parseQuickAdd('books 20 10/3', ctx)[0].date).toBe('2026-10-03');
  });

  it('puts a future month-day in the previous year', () => {
    expect(parseQuickAdd('hotel 300 dec 20', ctx)[0].date).toBe('2025-12-20');
  });

  it('leaves the amount empty when none is given', () => {
    expect(parseQuickAdd('coffee', ctx)[0]).toMatchObject({ amount: null, description: 'Coffee' });
  });

  it('ignores empty items and supports "and"', () => {
    expect(parseQuickAdd('coffee 5,, ', ctx)).toHaveLength(1);
    expect(parseQuickAdd('coffee 5 and gas 50', ctx)).toHaveLength(2);
    expect(parseQuickAdd('   ', ctx)).toEqual([]);
  });

  it('falls back to "Other" when nothing matches', () => {
    expect(parseQuickAdd('mystery 5', ctx)[0].category_id).toBe(9);
  });

  it('leaves the category empty when there is no "Other"', () => {
    const noOther = { ...ctx, categories: ctx.categories.filter((c) => c.id !== 9) };
    expect(parseQuickAdd('mystery 5', noOther)[0].category_id).toBeNull();
  });
});
