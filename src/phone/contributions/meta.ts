import { format, parseISO } from 'date-fns';
import type { RegisteredKind } from '@shared/types';
import { RRSP_BUFFER } from '@shared/registered';
import { money, moneyWhole } from '../format';

/** How each kind looks on the phone. The emoji is stored/looked up in ui/icons.ts, never drawn. */
export const KIND_META: Record<RegisteredKind, { label: string; full: string; color: string; emoji: string }> = {
  rrsp: { label: 'RRSP', full: 'Registered Retirement Savings Plan', color: '#6366f1', emoji: '🏦' },
  tfsa: { label: 'TFSA', full: 'Tax-Free Savings Account', color: '#10b981', emoji: '🌱' },
  fhsa: { label: 'FHSA', full: 'First Home Savings Account', color: '#f59e0b', emoji: '🏠' },
};

export const KIND_ORDER: RegisteredKind[] = ['rrsp', 'tfsa', 'fhsa'];

/** "$600" for whole amounts, "$583.33" otherwise — short where it can be. */
export const cash = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? moneyWhole(n) : money(n));

export const shortDate = (iso: string) => format(parseISO(iso), 'MMM d, yyyy');
export const monthShort = (month: string) => format(parseISO(`${month}-01`), 'MMM');

/** The amber over-room line, or null. */
export function overRoom(kind: RegisteredKind, room: number, contributed: number): string | null {
  const over = Math.round((contributed - room) * 100) / 100;
  if (over <= 0) return null;
  if (kind === 'rrsp' && over <= RRSP_BUFFER) return `${cash(over)} over your room (up to $2,000 is allowed)`;
  return `${cash(over)} over your room`;
}
