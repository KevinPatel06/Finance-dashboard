import { useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { CalendarDays, MoreHorizontal } from 'lucide-react';
import type { Debt, Expense, ExpenseCategory, ExpenseInput, SavingsGoal } from '@shared/types';
import { guessCategory } from '@shared/quickAdd';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useRefresh } from '../data';
import { todayIso } from '../dates';
import { money } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiIcon, parseMoney } from '../ui/kit';
import { iconInk } from '../ui/pastel';
import Keypad from './Keypad';

/** How many categories show before "All". */
const SUGGESTED = 4;

type PaidFrom = 'budget' | 'fund' | 'card';

/**
 * Add or edit one expense. "Paid from" chooses where the money came from: the
 * budget (default), a fund (doesn't count against the budget), or a credit
 * card (raises the card's balance). With `onDraft` it returns the input
 * instead of saving — the quick-add sheet uses that to edit a parsed draft.
 */
export default function ExpenseEditor({
  expense,
  initial,
  onClose,
  onSaved,
  onDraft,
}: {
  expense?: Expense;
  initial?: Partial<ExpenseInput>;
  onClose: () => void;
  onSaved?: () => void;
  onDraft?: (input: ExpenseInput) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const seed: Partial<ExpenseInput> = expense ?? initial ?? {};
  const [amount, setAmount] = useState(seed.amount ? String(seed.amount) : '');
  const [description, setDescription] = useState(seed.description ?? '');
  const [date, setDate] = useState(seed.date ?? todayIso());
  const [categoryId, setCategoryId] = useState<number | null>(seed.category_id ?? null);
  const [note, setNote] = useState(seed.note && seed.note !== 'Recurring' ? seed.note : '');
  const [paidFrom, setPaidFrom] = useState<PaidFrom>(seed.fund_id ? 'fund' : seed.debt_id ? 'card' : 'budget');
  const [fundId, setFundId] = useState<number | null>(seed.fund_id ?? null);
  const [cardId, setCardId] = useState<number | null>(seed.debt_id ?? null);
  const [busy, setBusy] = useState(false);

  const [allCats, setAllCats] = useState(false);
  const { data: categories } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());
  const { data: history } = useApi<Expense[]>(() => window.api.expenses.list());
  const cards = (debts ?? []).filter((d) => d.type === 'credit_card' || d.type === 'line_of_credit');

  const today = todayIso();
  const yesterday = format(subDays(parseISO(today), 1), 'yyyy-MM-dd');

  // Suggestions: what the description points to, then the most used lately,
  // then the rest. The pick the sheet opened with stays in place, and a pick
  // from "All" takes the last slot, so tapping never reshuffles the row.
  const ranked = useMemo(() => {
    const cats = categories ?? [];
    const recent = (history ?? []).slice(0, 200);
    const uses = new Map<number, number>();
    for (const e of recent) if (e.category_id != null) uses.set(e.category_id, (uses.get(e.category_id) ?? 0) + 1);
    const guess = guessCategory(description, {
      today,
      categories: cats,
      history: recent.map((e) => ({ description: e.description, category_id: e.category_id })),
    });
    const order = [seed.category_id ?? null, guess, ...[...cats].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0)).map((c) => c.id)];
    const ids = [...new Set(order.filter((id): id is number => id != null && cats.some((c) => c.id === id)))];
    return ids.map((id) => cats.find((c) => c.id === id)!);
    // Re-rank as the description changes, not on every tap (categoryId is left out on purpose).
  }, [categories, history, description, seed.category_id, today]);
  const suggested = (() => {
    const top = ranked.slice(0, SUGGESTED);
    if (categoryId == null || top.some((c) => c.id === categoryId)) return top;
    const picked = ranked.find((c) => c.id === categoryId);
    return picked ? [...top.slice(0, SUGGESTED - 1), picked] : top;
  })();
  const picked = (categories ?? []).find((c) => c.id === categoryId);

  const value = parseMoney(amount);
  const valid =
    value > 0 &&
    description.trim().length > 0 &&
    !!date &&
    (paidFrom !== 'fund' || fundId != null) &&
    (paidFrom !== 'card' || cardId != null);

  const input = (): ExpenseInput => ({
    description: description.trim(),
    amount: value,
    date,
    category_id: categoryId,
    // Keep the generated marker on recurring charges so they stay "off the top".
    note: note.trim() || (expense?.note === 'Recurring' ? 'Recurring' : null),
    fund_id: paidFrom === 'fund' ? fundId : null,
    debt_id: paidFrom === 'card' ? cardId : null,
  });

  const save = async () => {
    if (onDraft) {
      onDraft(input());
      return;
    }
    setBusy(true);
    try {
      if (expense) await window.api.expenses.update(expense.id, input());
      else await window.api.expenses.create(input());
      toast.success(expense ? 'Expense updated.' : 'Expense logged.');
      bump();
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!expense) return;
    const ok = await confirm({
      title: 'Delete this expense?',
      description: `${expense.description} — this can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.expenses.remove(expense.id);
    toast.success('Expense deleted.');
    bump();
    onSaved?.();
    onClose();
  };

  return (
    <Sheet
      open
      full
      // Open at the top with the keyboard down: focusing the amount here made
      // iOS raise the keyboard and scroll the sheet to its bottom.
      autoFocus={false}
      onClose={onClose}
      title={expense ? 'Edit expense' : onDraft ? 'Edit expense' : 'Log expense'}
      footer={
        <div className="space-y-2.5">
          <BigButton onClick={save} disabled={!valid || busy}>
            {busy
              ? 'Saving…'
              : onDraft
                ? 'Done'
                : value > 0
                  ? `Save ${money(value)}${picked ? ` to ${picked.name}` : ''}`
                  : 'Save'}
          </BigButton>
          <Keypad value={amount} onChange={setAmount} />
        </div>
      }
    >
      <div className="py-3 flex items-baseline justify-center gap-1 font-display font-bold" aria-live="polite">
        <span className="text-3xl text-content-muted">$</span>
        <span className={cn('text-5xl num-display', amount === '' && 'text-content-subtle/60')} aria-label={`Amount ${amount || '0'} dollars`}>
          {amount || '0'}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="expense-what">
            What was it?
          </label>
          <input
            id="expense-what"
            className="input text-base"
            placeholder="e.g. Coffee"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={80}
            data-no-autofocus
          />
        </div>

        <div role="radiogroup" aria-label="Date" className="flex flex-wrap gap-2">
          {[
            { iso: today, label: 'Today' },
            { iso: yesterday, label: 'Yesterday' },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              role="radio"
              aria-checked={date === d.iso}
              onClick={() => setDate(d.iso)}
              className={cn(
                'press [--dip:0.94] min-h-11 rounded-full px-4 text-[15px] font-medium',
                date === d.iso ? 'bg-content text-surface' : 'bg-surface-2 border border-border text-content'
              )}
            >
              {d.label}
            </button>
          ))}
          <label
            className={cn(
              'relative min-h-11 rounded-full px-4 inline-flex items-center gap-1.5 text-[15px] font-medium',
              date !== today && date !== yesterday ? 'bg-content text-surface' : 'bg-surface-2 border border-border text-content'
            )}
          >
            <CalendarDays size={17} aria-hidden />
            {date !== today && date !== yesterday && date ? format(parseISO(date), 'EEE, MMM d') : 'Pick a day'}
            <input
              type="date"
              className="absolute inset-0 opacity-0"
              value={date}
              max="2100-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Pick a date"
            />
          </label>
        </div>

        <div>
          <div className="label">Category</div>
          <div role="radiogroup" aria-label="Category" className={cn(allCats ? 'flex flex-wrap gap-2' : 'grid grid-cols-5 gap-2')}>
            {(allCats ? ranked : suggested).map((c) =>
              allCats ? (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setAllCats(false);
                  }}
                  className={cn(
                    'press [--dip:0.94] min-h-11 inline-flex items-center gap-1.5 rounded-full px-3.5 text-[15px] border',
                    categoryId === c.id ? 'bg-content text-surface border-transparent' : 'bg-surface-2 border-border text-content'
                  )}
                >
                  <EmojiIcon emoji={c.emoji} size={16} />
                  {c.name}
                </button>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={categoryId === c.id}
                  onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  className={cn(
                    'press [--dip:0.94] h-[60px] min-w-0 rounded-2xl bg-surface-2 border-2 flex flex-col items-center justify-center gap-1 px-1',
                    categoryId === c.id ? 'border-content' : 'border-transparent'
                  )}
                >
                  <span style={{ color: iconInk(c.color) }} className="leading-none">
                    <EmojiIcon emoji={c.emoji} size={20} />
                  </span>
                  <span className="text-[12px] font-medium leading-none truncate max-w-full">{c.name}</span>
                </button>
              )
            )}
            {!allCats && ranked.length > SUGGESTED && (
              <button
                type="button"
                onClick={() => setAllCats(true)}
                className="press [--dip:0.94] h-[60px] rounded-2xl border-2 border-dashed border-border-strong flex flex-col items-center justify-center gap-1"
              >
                <MoreHorizontal size={20} aria-hidden />
                <span className="text-[12px] font-medium leading-none">All {ranked.length}</span>
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="label">Paid from</div>
          <SegmentedControl
            value={paidFrom}
            onChange={setPaidFrom}
            options={[
              { value: 'budget', label: 'Budget' },
              ...((funds ?? []).length > 0 ? [{ value: 'fund' as const, label: 'A fund' }] : []),
              ...(cards.length > 0 ? [{ value: 'card' as const, label: 'Credit card' }] : []),
            ]}
          />
          {paidFrom === 'fund' && (
            <div className="flex flex-wrap gap-2 mt-3">
              {(funds ?? []).map((f) => (
                <Pick key={f.id} active={fundId === f.id} onClick={() => setFundId(f.id)}>
                  <EmojiIcon emoji={f.emoji} size={15} />
                  {f.name}
                </Pick>
              ))}
            </div>
          )}
          {paidFrom === 'card' && (
            <div className="flex flex-wrap gap-2 mt-3">
              {cards.map((d) => (
                <Pick key={d.id} active={cardId === d.id} onClick={() => setCardId(d.id)}>
                  <EmojiIcon emoji="💳" size={15} />
                  {d.name}
                </Pick>
              ))}
            </div>
          )}
          <p className="text-xs text-content-subtle mt-2">
            {paidFrom === 'fund'
              ? "Comes out of the fund, not this month's budget."
              : paidFrom === 'card'
                ? "Counts against your budget and adds to the card's balance."
                : "Counts against this month's spending."}
          </p>
        </div>

        <div>
          <label className="label">Note</label>
          <input
            className="input text-base"
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            data-no-autofocus
          />
        </div>

        {expense && (
          <button onClick={remove} className="w-full py-3 text-[15px] font-semibold text-danger">
            Delete expense
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Pick({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition',
        active ? 'bg-brand-soft border-brand text-content' : 'bg-surface-2 border-border text-content'
      )}
    >
      {children}
    </button>
  );
}
