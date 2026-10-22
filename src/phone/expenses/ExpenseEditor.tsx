import { useState } from 'react';
import type { Debt, Expense, ExpenseCategory, ExpenseInput, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useRefresh } from '../data';
import { todayIso } from '../dates';
import Sheet from '../ui/Sheet';
import { BigButton, MoneyInput, parseMoney } from '../ui/kit';

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

  const { data: categories } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());
  const cards = (debts ?? []).filter((d) => d.type === 'credit_card' || d.type === 'line_of_credit');

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
      onClose={onClose}
      title={expense ? 'Edit expense' : onDraft ? 'Edit expense' : 'Log expense'}
      footer={
        <BigButton onClick={save} disabled={!valid || busy}>
          {busy ? 'Saving…' : onDraft ? 'Done' : 'Save'}
        </BigButton>
      }
    >
      <div className="py-5">
        <MoneyInput big value={amount} onChange={setAmount} autoFocus={!expense} ariaLabel="Amount" />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            className="input text-base"
            placeholder="What was it?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={80}
            data-no-autofocus
          />
          <input
            type="date"
            className="input text-base w-[9.5rem]"
            value={date}
            max="2100-12-31"
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
          />
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
                  categoryId === c.id
                    ? 'bg-content text-surface border-transparent'
                    : 'bg-surface-2 border-border text-content'
                )}
              >
                <span>{c.emoji}</span>
                {c.name}
              </button>
            ))}
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
                  {f.emoji} {f.name}
                </Pick>
              ))}
            </div>
          )}
          {paidFrom === 'card' && (
            <div className="flex flex-wrap gap-2 mt-3">
              {cards.map((d) => (
                <Pick key={d.id} active={cardId === d.id} onClick={() => setCardId(d.id)}>
                  💳 {d.name}
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
        'rounded-full px-3 py-1.5 text-sm border transition',
        active ? 'bg-brand-soft border-brand text-content' : 'bg-surface-2 border-border text-content'
      )}
    >
      {children}
    </button>
  );
}
