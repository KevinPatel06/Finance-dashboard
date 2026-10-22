import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { BudgetMonthView, Debt, ExpenseCategory, PlanLineInput, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { money } from '../format';
import { EmojiAvatar, Group, MoneyInput, parseMoney, SectionTitle } from '../ui/kit';

/** Amount strings keyed by id; '' means "not in the plan". */
export interface PlanDraft {
  spend: Record<number, string>;
  fund: Record<number, string>;
  debt: Record<number, string>;
}

export const emptyDraft = (): PlanDraft => ({ spend: {}, fund: {}, debt: {} });

const str = (n: number) => (Math.round(n * 100) / 100).toString();

export function draftFromView(v: BudgetMonthView): PlanDraft {
  return {
    spend: Object.fromEntries(v.lines.spend.map((l) => [l.category_id, str(l.amount)])),
    fund: Object.fromEntries(v.lines.fund.map((l) => [l.goal_id, str(l.amount)])),
    debt: Object.fromEntries(v.lines.debt.map((l) => [l.debt_id, str(l.amount)])),
  };
}

export function draftToLines(d: PlanDraft): PlanLineInput[] {
  const out: PlanLineInput[] = [];
  for (const kind of ['spend', 'fund', 'debt'] as const) {
    for (const [id, v] of Object.entries(d[kind])) {
      if (v !== '') out.push({ kind, ref_id: Number(id), amount: parseMoney(v) });
    }
  }
  return out;
}

export const draftSum = (rec: Record<number, string>) =>
  Object.values(rec).reduce((s, v) => s + (v === '' ? 0 : parseMoney(v)), 0);

/**
 * Give every dollar a job: debt payments, fund contributions and Needs/Wants
 * spending, with the running "left to allocate" on top. Shared by the plan
 * editor, the new-month review and budget setup.
 */
export default function PlanForm({
  income,
  fixed,
  draft,
  onChange,
  categories,
  funds,
  debts,
  onAddCategory,
  onAddFund,
}: {
  income: number;
  fixed: number;
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  categories: ExpenseCategory[];
  funds: SavingsGoal[];
  debts: Debt[];
  onAddCategory?: () => void;
  onAddFund?: () => void;
}) {
  const [side, setSide] = useState<'need' | 'want'>('need');
  const left = income - fixed - draftSum(draft.debt) - draftSum(draft.fund) - draftSum(draft.spend);
  const set = (kind: keyof PlanDraft, id: number, v: string) =>
    onChange({ ...draft, [kind]: { ...draft[kind], [id]: v } });

  const shownCats = categories.filter((c) => c.kind === side);
  const sideTotal = shownCats.reduce((s, c) => s + parseMoney(draft.spend[c.id] ?? ''), 0);

  return (
    <div>
      <div className="text-center py-4">
        <div className={cn('text-[40px] leading-none font-display font-bold num-display', left < -0.004 && 'text-danger')}>
          {money(Math.abs(left))}
        </div>
        <div className="text-sm text-content-muted mt-1.5">
          {left < -0.004 ? 'over-allocated — trim something' : 'left to allocate'}
        </div>
        <div className="text-xs text-content-subtle mt-1">
          {money(income)} income − {money(fixed)} recurring
        </div>
      </div>

      {debts.length > 0 && (
        <>
          <SectionTitle>Debt payments</SectionTitle>
          <Group>
            {debts.map((d) => (
              <AmountRow
                key={d.id}
                emoji="💳"
                color="#ef4444"
                title={d.name}
                subtitle={`${money(d.current_balance)} owing`}
                value={draft.debt[d.id] ?? ''}
                onChange={(v) => set('debt', d.id, v)}
              />
            ))}
          </Group>
        </>
      )}

      <SectionTitle
        right={
          onAddFund && (
            <button onClick={onAddFund} className="inline-flex items-center gap-1 text-sm font-medium text-brand">
              <Plus size={16} /> Add fund
            </button>
          )
        }
      >
        Set aside for savings
      </SectionTitle>
      {funds.length === 0 ? (
        <p className="text-sm text-content-subtle px-1">No funds yet.</p>
      ) : (
        <Group>
          {funds.map((f) => (
            <AmountRow
              key={f.id}
              emoji={f.emoji}
              color={f.color}
              title={f.name}
              subtitle={`${money(f.target_amount)}${f.target_date ? ` by ${f.target_date}` : ''}`}
              value={draft.fund[f.id] ?? ''}
              onChange={(v) => set('fund', f.id, v)}
            />
          ))}
        </Group>
      )}

      <SectionTitle>Set aside for spending</SectionTitle>
      <SegmentedControl
        value={side}
        onChange={setSide}
        options={[
          { value: 'need', label: 'Needs' },
          { value: 'want', label: 'Wants' },
        ]}
      />
      <div className="text-xs text-content-subtle text-right px-1 mt-2 mb-1.5 num">
        {side === 'need' ? 'Needs' : 'Wants'}: {money(sideTotal)}
      </div>
      <Group>
        {shownCats.map((c) => (
          <AmountRow
            key={c.id}
            emoji={c.emoji}
            color={c.color}
            title={c.name}
            value={draft.spend[c.id] ?? ''}
            onChange={(v) => set('spend', c.id, v)}
          />
        ))}
        {onAddCategory && (
          <button onClick={onAddCategory} className="w-full py-3.5 text-[15px] font-semibold text-brand">
            Add category
          </button>
        )}
      </Group>
    </div>
  );
}

function AmountRow({
  emoji,
  color,
  title,
  subtitle,
  value,
  onChange,
}: {
  emoji: string | null;
  color: string;
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <EmojiAvatar emoji={emoji} color={color} size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
      </div>
      <div className="w-[7.5rem] shrink-0">
        <MoneyInput value={value} onChange={onChange} ariaLabel={`${title} amount`} />
      </div>
    </div>
  );
}
