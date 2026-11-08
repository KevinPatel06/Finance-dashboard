import { describe, it, expect } from 'vitest';
import { depositBanner, joinNames, savingButton } from '../../src/phone/budget/savingCopy';

/* eslint-disable @typescript-eslint/no-explicit-any */
const line = (label: string, amount: number, deposited: number) => ({
  account_id: 1,
  kind: 'rrsp',
  label,
  amount,
  deposited,
  left: Math.max(0, amount - deposited),
});
const v = (o: any = {}): any => ({
  status: 'confirmed',
  month: '2026-11',
  planned: { fund: 750, contribution: 2200 },
  saving: { planned: 2950, putAway: 1700, leftToDeposit: 1250, due: ['RRSP', 'FHSA'] },
  lines: {
    fund: [{ name: 'Emergency fund' }, { name: 'Vacation' }],
    contribution: [line('RRSP', 600, 350), line('TFSA', 600, 600), line('FHSA', 1000, 0)],
  },
  ...o,
});
const fundsOnly = (names: string[], total: number) =>
  v({
    planned: { fund: total, contribution: 0 },
    lines: { fund: names.map((name) => ({ name })), contribution: [] },
    saving: { planned: total, putAway: total, leftToDeposit: 0, due: [] },
  });

describe('savingButton (option 2: who is still due)', () => {
  it('names the accounts still waiting for a deposit', () => {
    expect(savingButton(v())).toEqual({ line1: '$1,250 left to deposit', line2: 'RRSP and FHSA', done: false });
  });
  it('says all deposited once every line is met', () => {
    expect(savingButton(v({ saving: { planned: 2950, putAway: 2950, leftToDeposit: 0, due: [] } }))).toEqual({
      line1: 'All deposited',
      line2: '$2,950 put away in November',
      done: true,
    });
  });
  it('funds only: names up to two funds, else counts them', () => {
    expect(savingButton(fundsOnly(['Emergency fund', 'Vacation'], 750))).toEqual({
      line1: '$750 into funds',
      line2: 'Emergency fund and Vacation',
      done: false,
    });
    expect(savingButton(fundsOnly(['A', 'B', 'C'], 900)).line2).toBe('3 funds');
  });
  it('a draft month counts once confirmed', () => {
    expect(savingButton(v({ status: 'draft' }))).toEqual({
      line1: '$2,950 planned',
      line2: 'Counts once you confirm',
      done: false,
    });
  });
  it('nothing planned', () => {
    expect(savingButton(fundsOnly([], 0))).toEqual({
      line1: 'Nothing planned yet',
      line2: 'Add a fund or an account',
      done: false,
    });
  });
});

describe('joinNames', () => {
  it('reads like a sentence', () => {
    expect(joinNames(['RRSP'])).toBe('RRSP');
    expect(joinNames(['RRSP', 'FHSA'])).toBe('RRSP and FHSA');
    expect(joinNames(['RRSP', 'TFSA', 'FHSA'])).toBe('RRSP, TFSA and FHSA');
  });
});

describe('depositBanner', () => {
  it('lists what is left per account in a confirmed month', () => {
    expect(depositBanner(v())).toEqual({
      title: 'Deposit $1,250 this month',
      body: "RRSP $250 · FHSA $1,000. It's already set aside in your plan. Log each one once it's in the account.",
    });
  });
  it('stays away in a draft month or when nothing is left', () => {
    expect(depositBanner(v({ status: 'draft' }))).toBeNull();
    expect(depositBanner(v({ saving: { planned: 2950, putAway: 2950, leftToDeposit: 0, due: [] } }))).toBeNull();
  });
});
