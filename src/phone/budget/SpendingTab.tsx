import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownUp, ChevronRight } from 'lucide-react';
import type { BudgetMonthView, SpendLineView } from '@shared/types';
import { cn } from '@/lib/utils';
import { money, pct } from '../format';
import { EmojiAvatar, Group, HatchedBar, PCard, Row, SectionTitle } from '../ui/kit';

type Filter = 'all' | 'need' | 'want';
type Sort = 'used' | 'name';

/** Spending allocations: Needs/Wants summary, a card per category, unbudgeted spend. */
export default function SpendingTab({ view: v, onEditPlan }: { view: BudgetMonthView; onEditPlan: () => void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('used');

  const lines = v.lines.spend
    .filter((l) => filter === 'all' || l.kind === filter)
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : usedFraction(b) - usedFraction(a)
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <SplitCard
          label="Needs"
          left={v.needsLeft}
          planned={v.planned.needs}
          active={filter === 'need'}
          onClick={() => setFilter(filter === 'need' ? 'all' : 'need')}
        />
        <SplitCard
          label="Wants"
          left={v.wantsLeft}
          planned={v.planned.wants}
          active={filter === 'want'}
          onClick={() => setFilter(filter === 'want' ? 'all' : 'want')}
        />
      </div>

      <SectionTitle
        right={
          <div className="flex items-center gap-4">
            <button className="text-[15px] font-medium" onClick={onEditPlan}>
              Edit
            </button>
            <button
              aria-label={sort === 'used' ? 'Sort by name' : 'Sort by most used'}
              onClick={() => setSort(sort === 'used' ? 'name' : 'used')}
              className="w-8 h-8 rounded-full bg-content text-surface grid place-items-center"
            >
              <ArrowDownUp size={15} strokeWidth={2.4} />
            </button>
          </div>
        }
      >
        {filter === 'all' ? 'Spending allocations' : filter === 'need' ? 'Needs' : 'Wants'}
      </SectionTitle>

      {lines.length === 0 && (
        <PCard className="p-5 text-center text-sm text-content-muted" onClick={onEditPlan}>
          No spending categories in this month's plan yet. Tap to add some.
        </PCard>
      )}

      {lines.map((l) => (
        <CategoryCard key={l.category_id} line={l} onClick={() => navigate(`/category/${l.category_id}`)} />
      ))}

      {v.unbudgeted.length > 0 && (
        <>
          <SectionTitle>No budget</SectionTitle>
          <Group>
            {v.unbudgeted.map((u) => (
              <Row
                key={u.category_id ?? 'none'}
                emoji={u.emoji}
                color={u.color}
                title={u.name}
                subtitle="Not in this month's plan"
                value={money(u.spent)}
                valueSub="spent"
                chevron={u.category_id != null}
                onClick={u.category_id != null ? () => navigate(`/category/${u.category_id}`) : undefined}
              />
            ))}
          </Group>
        </>
      )}

      <PlanSummary view={v} />
    </div>
  );
}

const usedFraction = (l: SpendLineView) => (l.amount > 0 ? l.spent / l.amount : l.spent > 0 ? 2 : 0);

function SplitCard({
  label,
  left,
  planned,
  active,
  onClick,
}: {
  label: string;
  left: number;
  planned: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-[20px] border px-4 py-3 text-left transition active:scale-[0.98]',
        active ? 'bg-content text-surface border-transparent' : 'bg-surface-2 border-border/70 shadow-card'
      )}
    >
      <div className={cn('text-xs font-medium', active ? 'opacity-70' : 'text-content-subtle')}>{label}</div>
      <div className={cn('text-lg font-display font-bold num mt-0.5', left < 0 && !active && 'text-danger')}>
        {money(Math.abs(left))}
      </div>
      <div className={cn('text-xs', active ? 'opacity-70' : 'text-content-subtle')}>
        {left < 0 ? 'over' : 'left'} of {money(planned)}
      </div>
    </button>
  );
}

export function CategoryCard({ line: l, onClick }: { line: SpendLineView; onClick: () => void }) {
  const over = l.left < 0;
  const leftPct = pct(Math.max(0, l.left), l.amount);
  return (
    <PCard onClick={onClick} className="px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-3">
        <EmojiAvatar emoji={l.emoji} color={l.color} />
        <div className="flex-1 min-w-0 text-[17px] font-semibold truncate">{l.name}</div>
        <ChevronRight size={18} className="text-content-subtle" />
      </div>
      <div className="mt-3">
        <HatchedBar
          pct={over ? 100 : leftPct}
          color={l.color}
          over={over}
          badge={over ? 'Over' : `${Math.round(leftPct)}%`}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className={cn('text-[15px] font-semibold num', over && 'text-danger')}>
          {money(Math.abs(l.left))} {over ? 'over' : 'left'}
        </span>
        <span className="text-[15px] num text-content-muted">{money(l.amount)}</span>
      </div>
    </PCard>
  );
}

function PlanSummary({ view: v }: { view: BudgetMonthView }) {
  const navigate = useNavigate();
  return (
    <>
      <SectionTitle>This month's plan</SectionTitle>
      <Group>
        <Row emoji="💵" color="#10b981" title="Income" subtitle={`${v.paydays.length} payday${v.paydays.length === 1 ? '' : 's'}`} value={money(v.income)} />
        <Row
          emoji="🔁"
          color="#64748b"
          title="Recurring"
          subtitle="Taken off the top"
          value={`−${money(v.recurring.total)}`}
          valueTone="muted"
          chevron
          onClick={() => navigate('/recurring')}
        />
        {v.planned.debt > 0 && (
          <Row
            emoji="💳"
            color="#ef4444"
            title="Debt payments"
            value={`−${money(v.planned.debt)}`}
            valueTone="muted"
            chevron
            onClick={() => navigate('/payoff')}
          />
        )}
        <Row emoji="💰" color="#8b5cf6" title="Saving" value={`−${money(v.planned.fund)}`} valueTone="muted" />
        <Row emoji="🛍️" color="#f59e0b" title="Spending" value={`−${money(v.planned.spend)}`} valueTone="muted" />
      </Group>
    </>
  );
}
