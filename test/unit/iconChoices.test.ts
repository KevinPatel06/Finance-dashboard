import { describe, it, expect } from 'vitest';
import { topIcons, withPick } from '../../src/phone/ui/iconChoices';

describe('topIcons', () => {
  it('leads with the name match, then the context defaults', () => {
    expect(topIcons('', 'Groceries', 'category')).toEqual(['🛒', '🍔', '🏠', '🚗', '🛍️']);
    expect(topIcons('', 'Emergency fund', 'fund')).toEqual(['🆘', '✈️', '🏠', '🚗', '🎁']);
    expect(topIcons('', '', 'recurring')).toEqual(['📱', '🌐', '💡', '📺', '🛡️']);
  });
  it('keeps a picked icon in the first spot', () => {
    expect(topIcons('🎮', 'Games', 'category')).toEqual(['🎮', '🎬', '🛒', '🍔', '🏠']);
  });
  it('treats an emoji with and without the variation selector as one', () => {
    expect(topIcons('🛡', 'Insurance', 'recurring')).toEqual(['🛡', '📱', '🌐', '💡', '📺']);
  });
});

describe('withPick', () => {
  const row = ['🛒', '🍔', '🏠', '🚗', '🛍️'];
  it('leaves the row alone when the pick is already in it', () => {
    expect(withPick(row, '🏠')).toEqual(row);
    expect(withPick(row, '🛍')).toEqual(row); // same icon without the variation selector
  });
  it('puts a pick from "See all" in the last slot', () => {
    expect(withPick(row, '🎮')).toEqual(['🛒', '🍔', '🏠', '🚗', '🎮']);
  });
  it('does nothing without a pick', () => {
    expect(withPick(row, '')).toEqual(row);
  });
});
