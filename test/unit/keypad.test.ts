import { describe, expect, it } from 'vitest';
import { pressKey } from '../../src/phone/expenses/Keypad';

const type = (keys: string[], start = '') =>
  keys.reduce((v, k) => pressKey(v, k as Parameters<typeof pressKey>[1]), start);

describe('Log expense keypad', () => {
  it('builds an amount digit by digit', () => {
    expect(type(['2', '4', '.', '5', '0'])).toBe('24.50');
  });

  it('allows one decimal point and two decimals', () => {
    expect(type(['1', '.', '.', '2', '3', '4'])).toBe('1.23');
  });

  it('starts a bare point with a zero and replaces a lone zero', () => {
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['0', '7'])).toBe('7');
  });

  it('deletes the last character, and does nothing on an empty amount', () => {
    expect(type(['1', '2', 'del'])).toBe('1');
    expect(type(['del'])).toBe('');
  });

  it('stops at seven whole digits', () => {
    expect(type(['1', '2', '3', '4', '5', '6', '7', '8'])).toBe('1234567');
  });
});
