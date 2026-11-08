import { describe, it, expect } from 'vitest';
import { topIcons } from '../../src/phone/ui/iconChoices';

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
