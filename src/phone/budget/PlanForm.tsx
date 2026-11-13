import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { BudgetMonthView, Debt, ExpenseCategory, PlanLineInput, RegisteredAccount, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { money } from '../format';
import { EmojiAvatar, Group, MoneyInput, parseMoney } from '../ui/kit';
import { cash, KIND_META, shortDate } from '../contributions/meta';
import { PLAN_COLOR } from './planColors';
import PlanSection from './PlanSection';

/** Amount strings keyed by id; '' means "not in the plan". */
export interface PlanDraft {
  spend: Record<number, string>;
  fund: Record<number, string>;
  debt: Record<number, string>;
  /** RRSP / TFSA / FHSA lines, keyed by account id. */
  contribution: Record<number, string>;
}

export const emptyDraft = (): PlanDraft => ({ spend: {}, fund: {}, debt: {}, contribution: {} });

const str = (n: number) => (Math.round(n * 100) / 100).toString();

export function draftFromView(v: BudgetMonthView): PlanDraft {
  return {
    spend: Object.fromEntries(v.lines.spend.map((l) => [l.category_id, str(l.amount)])),
    fund: Object.fromEntries(v.lines.fund.map((l) => [l.goal_id, str(l.amount)])),
    debt: Object.fromEntries(v.lines.debt.map((l) => [l.debt_id, str(l.amount)])),
    contribution: Object.fromEntries(v.lines.contribution.map((l) => [l.account_id, str(l.amount)])),
  };
}

export function draftToLines(d: PlanDraft): PlanLineInput[] {
  const out: PlanLineInput[] = [];
  for (const kind of ['spend', 'fund', 'debt', 'contribution'] as const) {
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
  accounts = [],
  onAddCategory,
  onAddFund,
  onEditCategory,
  onEditFund,
  onEditDebt,
  onEditAccount,
  collapsible,
  lead,
}: {
  income: number;
  fixed: number;
  /** Fold each section to one row (the Edit plan sheet); setup leaves them open. */
  collapsible?: boolean;
  /** Sections shown between the summary and the plan lines (the editor's Income and Recurring). */
  lead?: ReactNode;
  draft: PlanDraft;
  onChange: (d: PlanDraft) => void;
  categories: ExpenseCategory[];
  funds: SavingsGoal[];
  debts: Debt[];
  /** Registered accounts; waiting ones are left out. */
  accounts?: RegisteredAccount[];
  onAddCategory?: () => void;
  onAddFund?: () => void;
  /** Make a row's name tappable to fix it (setup). */
  onEditCategory?: (c: ExpenseCategory) => void;
  onEditFund?: (f: SavingsGoal) => void;
  onEditDebt?: (d: Debt) => void;
  onEditAccount?: (a: RegisteredAccount) => void;
}) {
  const [side, setSide] = useState<'need' | 'want'>('need');
  const sums = {
    debt: draftSum(draft.debt),
    fund: draftSum(draft.fund),
    contribution: draftSum(draft.contribution),
    spend: draftSum(draft.spend),
  };
  const left = income - fixed - sums.debt - sums.fund - sums.contribution - sums.spend;
  const openAccounts = accounts.filter((a) => !a.waiting);
  const set = (kind: keyof PlanDraft, id: number, v: string) =>
    onChange({ ...draft, [kind]: { ...draft[kind], [id]: v } });

  const shownCats = categories.filter((c) => c.kind === side);
  const sideTotal = shownCats.reduce((s, c) => s + parseMoney(draft.spend[c.id] ?? ''), 0);
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  return (
    <div>
      <PlanSummaryCard income={income} recurring={fixed} {...sums} />
      {lead}

      {debts.length > 0 && (
        <PlanSection
          collapsible={collapsible}
          title="Debt payments"
          subtitle={debts.map((d) => d.name).join(', ')}
          total={money(sums.debt)}
          color={PLAN_COLOR.debt}
        >
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
                onEdit={onEditDebt && (() => onEditDebt(d))}
              />
            ))}
          </Group>
        </PlanSection>
      )}

      <PlanSection
        collapsible={collapsible}
        title="Set aside for savings"
        subtitle={funds.length ? count(funds.length, 'fund') : 'No funds yet'}
        total={money(sums.fund)}
        color={PLAN_COLOR.fund}
        action={
          onAddFund && (
            <button onClick={onAddFund} className="min-h-11 inline-flex items-center gap-1 text-[15px] font-medium text-brand-ink">
              <Plus size={16} /> Add fund
            </button>
          )
        }
      >
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
              onEdit={onEditFund && (() => onEditFund(f))}
            />
          ))}
        </Group>
      )}
      </PlanSection>

      {openAccounts.length > 0 && (
        <PlanSection
          collapsible={collapsible}
          title="Contributions"
          subtitle={openAccounts.map((a) => a.label || KIND_META[a.kind].label).join(', ')}
          total={money(sums.contribution)}
          color={PLAN_COLOR.contribution}
        >
          <Group>
            {openAccounts.map((a) => (
              <AmountRow
                key={a.id}
                emoji={KIND_META[a.kind].emoji}
                color={KIND_META[a.kind].color}
                title={a.label || KIND_META[a.kind].label}
                subtitle={
                  a.goal
                    ? `${cash(Math.max(0, a.goal - a.contributed))} to go by ${shortDate(a.goal_deadline)}`
                    : 'No goal set'
                }
                value={draft.contribution[a.id] ?? ''}
                onChange={(v) => set('contribution', a.id, v)}
                onEdit={onEditAccount && (() => onEditAccount(a))}
              />
            ))}
          </Group>
        </PlanSection>
      )}

      <PlanSection
        collapsible={collapsible}
        title="Set aside for spending"
        subtitle="Needs and wants"
        total={money(sums.spend)}
        color={PLAN_COLOR.spend}
      >
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
            onEdit={onEditCategory && (() => onEditCategory(c))}
          />
        ))}
        {onAddCategory && (
          <button onClick={onAddCategory} className="w-full py-3.5 text-[15px] font-semibold text-brand">
            Add category
          </button>
        )}
      </Group>
      </PlanSection>
    </div>
  );
}

/**
 * The plan at a glance: what's left to give a job, and one bar of everything
 * planned in the same colours as the Budget breakdown. When the plan is bigger
 * than income, a line marks where income runs out.
 */
function PlanSummaryCard({
  income,
  recurring,
  debt,
  fund,
  contribution,
  spend,
}: {
  income: number;
  recurring: number;
  debt: number;
  fund: number;
  contribution: number;
  spend: number;
}) {
  const parts = [
    { key: 'recurring', amount: recurring, color: PLAN_COLOR.recurring, label: 'Recurring' },
    { key: 'debt', amount: debt, color: PLAN_COLOR.debt, label: 'Debt' },
    { key: 'fund', amount: fund, color: PLAN_COLOR.fund, label: 'Funds' },
    { key: 'contribution', amount: contribution, color: PLAN_COLOR.contribution, label: 'Contributions' },
    { key: 'spend', amount: spend, color: PLAN_COLOR.spend, label: 'Spending' },
  ].filter((p) => p.amount > 0.004);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  const left = income - total;
  const over = left < -0.004;
  const scale = Math.max(income, total);
  const incomeAt = scale > 0 ? (income / scale) * 100 : 100;

  return (
    <div className="rounded-[22px] bg-surface-2 border border-border/70 shadow-card px-4 pt-3.5 pb-3 mt-2">
      <div className="text-sm font-medium text-content-muted">Left to assign</div>
      <div className={cn('text-[40px] leading-none font-display font-bold num-display mt-1 whitespace-nowrap', over && 'text-danger')}>
        {over ? '−' : ''}
        {money(Math.abs(left))}
      </div>
      <div className="text-sm text-content-muted num mt-1">of {money(income)} income</div>

      <div className="relative mt-4 pt-4">
        {over && (
          <span
            className="absolute top-0 -translate-x-1/2 text-[12px] font-semibold text-content"
            style={{ left: `${incomeAt}%` }}
          >
            income
          </span>
        )}
        <div
          className="flex gap-0.5 h-4 rounded-full overflow-hidden bg-surface-3"
          role="img"
          aria-label={`Planned ${money(total)} of ${money(income)} income: ${parts.map((p) => `${p.label} ${money(p.amount)}`).join(', ')}`}
        >
          {parts.map((p) => (
            <div key={p.key} style={{ width: `${(p.amount / scale) * 100}%`, backgroundColor: p.color }} />
          ))}
        </div>
        {over && (
          <div
            aria-hidden
            className="absolute bottom-[-4px] w-[3px] h-6 -ml-[1.5px] rounded-full bg-content"
            style={{ left: `${incomeAt}%` }}
          />
        )}
      </div>

      <p className="mt-3 text-sm text-content-muted">
        {over
          ? 'Everything right of the line is planned beyond your income. Lower a contribution, a fund or a category.'
          : left > 0.004
            ? `${money(left)} still needs a job: a fund, a debt payment or spending.`
            : 'Every dollar has a job.'}
      </p>
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
  onEdit,
}: {
  emoji: string | null;
  color: string;
  title: string;
  subtitle?: string;
  value: string;
  onChange: (v: string) => void;
  onEdit?: () => void;
}) {
  const label = (
    <>
      <EmojiAvatar emoji={emoji} color={color} size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
      </div>
    </>
  );
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="press [--dip:0.97] min-w-0 flex-1 flex items-center gap-3 text-left"
        >
          {label}
        </button>
      ) : (
        label
      )}
      <div className="w-[7.5rem] shrink-0">
        <MoneyInput value={value} onChange={onChange} ariaLabel={`${title} amount`} />
      </div>
    </div>
  );
}
