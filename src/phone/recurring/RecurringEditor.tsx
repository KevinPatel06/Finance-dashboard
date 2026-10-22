import { useState } from 'react';
import type { Debt, ExpenseCategory, RecurringExpense, RecurringFrequency } from '@shared/types';
import { suggestEmoji } from '@shared/emoji';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useRefresh } from '../data';
import { todayIso } from '../dates';
import EmojiField from '../ui/EmojiField';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiAvatar, MoneyInput, parseMoney } from '../ui/kit';
import { nextOccurrence, weeksPerStep } from './schedule';

type Unit = 'weeks' | 'months' | 'years';
const UNIT_FREQ: Record<Unit, RecurringFrequency> = { weeks: 'weekly', months: 'monthly', years: 'yearly' };

/** Rent, subscriptions, insurance: anything that repeats every N weeks, months or years. */
export default function RecurringEditor({
  item,
  initial,
  onClose,
  onSaved,
}: {
  item?: RecurringExpense;
  initial?: { description?: string; amount?: number };
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const [description, setDescription] = useState(item?.description ?? initial?.description ?? '');
  const [amount, setAmount] = useState(item ? String(item.amount) : initial?.amount ? String(initial.amount) : '');
  const [emoji, setEmoji] = useState(item?.emoji ?? '');
  const [emojiTouched, setEmojiTouched] = useState(!!item);
  const [categoryId, setCategoryId] = useState<number | null>(item?.category_id ?? null);
  const [unit, setUnit] = useState<Unit>(
    !item ? 'months' : item.frequency === 'yearly' ? 'years' : item.frequency === 'monthly' ? 'months' : 'weeks'
  );
  const [every, setEvery] = useState(
    String(!item ? 1 : item.frequency === 'weekly' || item.frequency === 'biweekly' ? weeksPerStep(item) : item.interval_count)
  );
  const [next, setNext] = useState(item ? nextOccurrence(item) ?? todayIso() : todayIso());
  const [cardId, setCardId] = useState<number | null>(item?.debt_id ?? null);
  const [paused, setPaused] = useState(item?.archived === 1);
  const [busy, setBusy] = useState(false);

  const { data: categories } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());
  const cards = (debts ?? []).filter((d) => d.type === 'credit_card' || d.type === 'line_of_credit');

  const shownEmoji = emojiTouched ? emoji : suggestEmoji(description, '🔁');
  const n = Math.max(1, Math.min(52, Math.round(Number(every) || 1)));
  const valid = description.trim().length > 0 && parseMoney(amount) > 0 && !!next;

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        description: description.trim(),
        amount: parseMoney(amount),
        category_id: categoryId,
        debt_id: cardId,
        frequency: UNIT_FREQ[unit],
        interval_count: n,
        anchor_date: next,
        emoji: shownEmoji,
        archived: paused,
      };
      if (item) await window.api.recurringExpenses.update(item.id, input);
      else await window.api.recurringExpenses.create(input);
      toast.success(item ? 'Saved.' : `${input.description} added.`);
      bump();
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    const ok = await confirm({
      title: `Delete ${item.description}?`,
      description: 'It stops repeating. Charges already logged stay in your expenses.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.recurringExpenses.remove(item.id);
    bump();
    onSaved?.();
    onClose();
  };

  return (
    <Sheet
      open
      full
      onClose={onClose}
      title={item ? 'Edit recurring' : 'New recurring expense'}
      footer={
        <BigButton onClick={save} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </BigButton>
      }
    >
      <div className="flex justify-center py-2">
        <EmojiAvatar emoji={shownEmoji} color="#64748b" size="lg" />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <div>
            <label className="label">Name</label>
            <input
              className="input text-base"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Rent"
              maxLength={60}
            />
          </div>
          <div>
            <label className="label">Amount</label>
            <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount" />
          </div>
        </div>

        <div>
          <label className="label">Repeats</label>
          <div className="flex items-center gap-2">
            <span className="text-[15px]">Every</span>
            <input
              className="input w-16 text-center text-base num"
              inputMode="numeric"
              value={every}
              onChange={(e) => setEvery(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              aria-label="Every how many"
              data-no-autofocus
            />
            <SegmentedControl
              className="flex-1"
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'weeks', label: n === 1 ? 'Week' : 'Weeks' },
                { value: 'months', label: n === 1 ? 'Month' : 'Months' },
                { value: 'years', label: n === 1 ? 'Year' : 'Years' },
              ]}
            />
          </div>
        </div>

        <div>
          <label className="label">Next charge</label>
          <input type="date" className="input text-base" value={next} onChange={(e) => setNext(e.target.value)} />
          <p className="text-xs text-content-subtle mt-1">
            It's logged as an expense automatically on each date and taken off the top of your budget.
          </p>
        </div>

        <div>
          <div className="label">Category</div>
          <div className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition',
                  categoryId === c.id ? 'bg-content text-surface border-transparent' : 'bg-surface-2 border-border'
                )}
              >
                <span>{c.emoji}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {cards.length > 0 && (
          <div>
            <div className="label">Charged to</div>
            <SegmentedControl
              value={cardId == null ? 'none' : String(cardId)}
              onChange={(v) => setCardId(v === 'none' ? null : Number(v))}
              options={[{ value: 'none', label: 'Bank' }, ...cards.map((d) => ({ value: String(d.id), label: d.name }))]}
            />
          </div>
        )}

        <div>
          <label className="label">Emoji</label>
          <EmojiField
            value={shownEmoji}
            onChange={(e) => {
              setEmoji(e);
              setEmojiTouched(true);
            }}
          />
        </div>

        {item && (
          <div className="flex gap-2">
            <button
              onClick={() => setPaused(!paused)}
              className="flex-1 py-3 rounded-full bg-surface-3 text-[15px] font-semibold"
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button onClick={remove} className="flex-1 py-3 rounded-full bg-danger/10 text-danger text-[15px] font-semibold">
              Delete
            </button>
          </div>
        )}
        {item && paused && (
          <p className="text-xs text-content-subtle text-center">
            Paused — nothing is logged until you resume, and missed charges aren't back-filled.
          </p>
        )}
      </div>
    </Sheet>
  );
}
