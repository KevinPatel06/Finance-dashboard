import type { Expense, ExpenseCategory } from '@shared/types';
import { friendlyDate } from '../dates';
import { money } from '../format';
import { InitialAvatar, Row } from '../ui/kit';

/**
 * One expense in a list: category icon, description, where it was paid from,
 * its note, amount. `byName` swaps the icon for the description's first letter
 * (a category's own screen, where every row would show the same icon).
 */
export default function ExpenseRow({
  expense: e,
  category,
  fundName,
  cardName,
  hideCategory,
  hideDate,
  byName,
  onClick,
}: {
  expense: Expense;
  category?: ExpenseCategory;
  fundName?: string;
  cardName?: string;
  hideCategory?: boolean;
  hideDate?: boolean;
  byName?: boolean;
  onClick?: () => void;
}) {
  const recurring = e.recurring_id != null || e.note === 'Recurring';
  const bits = [
    !hideCategory && (category?.name ?? 'Uncategorized'),
    !hideDate && friendlyDate(e.date),
    fundName && `from ${fundName}`,
    cardName && `on ${cardName}`,
    recurring && 'recurring',
    !recurring && e.note && `“${e.note}”`,
  ].filter(Boolean);
  const color = category?.color ?? '#94a3b8';
  return (
    <Row
      emoji={byName ? undefined : category?.emoji ?? '❔'}
      color={color}
      leading={byName ? <InitialAvatar name={e.description} color={color} /> : undefined}
      title={e.description}
      subtitle={bits.length ? bits.join(' · ') : undefined}
      value={money(e.amount)}
      onClick={onClick}
    />
  );
}
