import { describe, it, expect } from 'vitest';
import { suggestEmoji, suggestKind } from '../../shared/emoji';

describe('suggestEmoji', () => {
  it('matches common category names', () => {
    expect(suggestEmoji('Rent')).toBe('🏠');
    expect(suggestEmoji('Groceries & household')).toBe('🛒');
    expect(suggestEmoji('Eating out')).toBe('🍔');
    expect(suggestEmoji('Gas')).toBe('⛽');
    expect(suggestEmoji('Travel')).toBe('✈️');
  });

  it('is case-insensitive and ignores surrounding words', () => {
    expect(suggestEmoji('my GYM membership')).toBe('🧘');
  });

  it('falls back when nothing matches', () => {
    expect(suggestEmoji('zzzz')).toBe('📦');
    expect(suggestEmoji('zzzz', '💰')).toBe('💰');
    expect(suggestEmoji('')).toBe('📦');
  });
});

describe('suggestKind', () => {
  it('treats essentials as needs', () => {
    expect(suggestKind('Rent')).toBe('need');
    expect(suggestKind('Groceries')).toBe('need');
    expect(suggestKind('Transport')).toBe('need');
  });

  it('treats everything else as wants', () => {
    expect(suggestKind('Entertainment')).toBe('want');
    expect(suggestKind('Shopping')).toBe('want');
    expect(suggestKind('zzzz')).toBe('want');
  });
});
