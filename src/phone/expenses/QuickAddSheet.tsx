import { useMemo, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import type { Expense, ExpenseCategory, ExpenseInput } from '@shared/types';
import { parseQuickAdd } from '@shared/quickAdd';
import { useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useRefresh } from '../data';
import { friendlyDate, todayIso } from '../dates';
import { money } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiAvatar } from '../ui/kit';
import ExpenseEditor from './ExpenseEditor';

export interface QuickAddOptions {
  categoryId?: number;
  date?: string;
  /** Skip the text box and open the form straight away. */
  manual?: boolean;
}

/**
 * The + button: type "coffee 5, gas 50 yesterday" and confirm the expenses it
 * finds. Rules only (shared/quickAdd.ts), learning categories from the user's
 * own history. Any draft can be opened in the full form before confirming.
 */
export default function QuickAddSheet({ options, onClose }: { options: QuickAddOptions; onClose: () => void }) {
  const toast = useToast();
  const { bump } = useRefresh();
  const [manual, setManual] = useState(!!options.manual);
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Record<string, ExpenseInput>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ raw: string; input: Partial<ExpenseInput> } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: categories } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: expenses } = useApi<Expense[]>(() => window.api.expenses.list());
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));

  const drafts = useMemo(() => {
    if (!categories || !expenses) return [];
    return parseQuickAdd(text, {
      today: todayIso(),
      categories,
      // listExpenses is newest first already.
      history: expenses.map((e) => ({ description: e.description, category_id: e.category_id })),
    }).map((d) => {
      const edited = edits[d.raw];
      const input: Partial<ExpenseInput> = edited ?? {
        description: d.description,
        amount: d.amount ?? undefined,
        date: d.date,
        category_id: d.category_id,
      };
      return { raw: d.raw, input };
    });
  }, [text, categories, expenses, edits]);

  const isValid = (i: Partial<ExpenseInput>) => !!i.description && (i.amount ?? 0) > 0;
  const ready = drafts.filter((d) => !skipped.has(d.raw) && isValid(d.input));

  if (manual) {
    return (
      <ExpenseEditor
        initial={{ category_id: options.categoryId ?? null, date: options.date ?? todayIso() }}
        onClose={onClose}
      />
    );
  }

  const confirm = async () => {
    setBusy(true);
    try {
      for (const d of ready) await window.api.expenses.create(d.input as ExpenseInput);
      const total = ready.reduce((s, d) => s + (d.input.amount ?? 0), 0);
      toast.success(`Logged ${ready.length} expense${ready.length === 1 ? '' : 's'} · ${money(total)}`);
      bump();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open={!editing}
        onClose={onClose}
        title="Log expenses"
        footer={
          <div className="space-y-2">
            <BigButton onClick={confirm} disabled={ready.length === 0 || busy}>
              {busy ? 'Saving…' : ready.length > 0 ? `Confirm (${ready.length})` : 'Confirm'}
            </BigButton>
            <button onClick={() => setManual(true)} className="w-full py-2 text-[15px] font-medium text-content-muted">
              Add manually instead
            </button>
          </div>
        }
      >
        <textarea
          className="input text-base rounded-2xl min-h-[96px] resize-none leading-relaxed"
          placeholder={'Try "coffee 5, gas 50 yesterday"'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="What did you spend?"
        />
        <p className="text-xs text-content-subtle mt-2 px-1">
          Separate items with commas. Add a day like “yesterday”, “monday” or “oct 3”.
        </p>

        {drafts.length > 0 && (
          <div className="mt-4 rounded-[22px] bg-surface-2 border border-border/70 shadow-card divide-y divide-border/70 overflow-hidden">
            {drafts.map((d) => {
              const cat = d.input.category_id != null ? catById.get(d.input.category_id) : undefined;
              const on = !skipped.has(d.raw);
              const valid = isValid(d.input);
              return (
                <div key={d.raw} className={cn('flex items-center gap-3 px-3 py-3', !on && 'opacity-45')}>
                  <button
                    aria-label={on ? 'Skip this one' : 'Include this one'}
                    onClick={() => {
                      const next = new Set(skipped);
                      if (on) next.add(d.raw);
                      else next.delete(d.raw);
                      setSkipped(next);
                    }}
                    className={cn(
                      'w-6 h-6 rounded-full grid place-items-center shrink-0 border',
                      on && valid ? 'bg-content text-surface border-transparent' : 'border-border-strong'
                    )}
                  >
                    {on && valid && <Check size={14} strokeWidth={3} />}
                  </button>
                  <EmojiAvatar emoji={cat?.emoji ?? '❔'} color={cat?.color ?? '#94a3b8'} size="sm" />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[15px] font-medium truncate">{d.input.description || 'Untitled'}</div>
                    <div className="text-xs text-content-subtle truncate">
                      {cat?.name ?? 'No category'} · {friendlyDate(d.input.date ?? todayIso())}
                      {d.input.fund_id ? ' · from a fund' : d.input.debt_id ? ' · on card' : ''}
                    </div>
                  </div>
                  <div className={cn('text-[15px] font-semibold num shrink-0', !valid && 'text-warning')}>
                    {valid ? money(d.input.amount!) : 'Add amount'}
                  </div>
                  <button
                    aria-label="Edit"
                    onClick={() => setEditing({ raw: d.raw, input: d.input })}
                    className="p-1.5 -mr-1 text-content-muted"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Sheet>

      {editing && (
        <ExpenseEditor
          initial={editing.input}
          onClose={() => setEditing(null)}
          onDraft={(input) => {
            setEdits({ ...edits, [editing.raw]: input });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
