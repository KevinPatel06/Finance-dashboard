import type { Expense, ExpenseCategory } from '@shared/types';
import { friendlyDate } from '../dates';
import { money } from '../format';
import { Row } from '../ui/kit';

/** One expense in a list: category emoji, description, where it was paid from, amount. */
export default function ExpenseRow({
  expense: e,
  category,
  fundName,
  cardName,
  hideCategory,
  onClick,
}: {
  expense: Expense;
  category?: ExpenseCategory;
  fundName?: string;
  cardName?: string;
  hideCategory?: boolean;
  onClick?: () => void;
}) {
  const bits = [
    !hideCategory && (category?.name ?? 'Uncategorized'),
    friendlyDate(e.date),
    fundName && `from ${fundName}`,
    cardName && `on ${cardName}`,
    (e.recurring_id != null || e.note === 'Recurring') && 'recurring',
  ].filter(Boolean);
  return (
    <Row
      emoji={category?.emoji ?? '❔'}
      color={category?.color ?? '#94a3b8'}
      title={e.description}
      subtitle={bits.join(' · ')}
      value={money(e.amount)}
      onClick={onClick}
    />
  );
}
