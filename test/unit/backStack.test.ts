import { beforeEach, describe, expect, it } from 'vitest';
import { _resetBackStack, handleBack, pushBack } from '../../src/lib/backStack';

describe('backStack', () => {
  beforeEach(() => _resetBackStack());

  it('handleBack returns false when nothing is registered', () => {
    expect(handleBack()).toBe(false);
  });

  it('the most recently registered handler runs first', () => {
    const calls: string[] = [];
    pushBack(() => calls.push('sheet'));
    pushBack(() => calls.push('dialog'));
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['dialog']);
  });

  it('unregistering out of order keeps the right top', () => {
    const calls: string[] = [];
    const offA = pushBack(() => calls.push('A'));
    const offB = pushBack(() => calls.push('B'));
    offA();
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['B']);
    offB();
    expect(handleBack()).toBe(false);
  });

  it('unregister is idempotent', () => {
    const calls: string[] = [];
    pushBack(() => calls.push('A'));
    const offB = pushBack(() => calls.push('B'));
    offB();
    offB();
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['A']);
  });
});
