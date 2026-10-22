import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import type { BudgetMonthView, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { fmtDate } from '@/lib/format';
import { useApi } from '../data';
import { money, pct } from '../format';
import { EmojiAvatar, HatchedBar, PCard } from '../ui/kit';
import FundEditor from '../funds/FundEditor';

type Filter = 'active' | 'completed' | 'plan';

/** Funds: total saved, filters, and a progress card per fund. */
export default function SavingTab({ view }: { view: BudgetMonthView }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('active');
  const [adding, setAdding] = useState(false);
  const { data: active, reload } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: done } = useApi<SavingsGoal[]>(() => window.api.goals.listArchived());

  if (!active || !done) return null;
  const inPlan = new Set(view.lines.fund.map((l) => l.goal_id));
  const planned = new Map(view.lines.fund.map((l) => [l.goal_id, l.amount]));
  const shown =
    filter === 'completed' ? done : filter === 'plan' ? active.filter((g) => inPlan.has(g.id)) : active;
  const totalSaved = active.reduce((s, g) => s + g.current_amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="text-[15px] text-content-muted">
          Total saved: <span className="text-content font-semibold num">{money(totalSaved)}</span>
        </div>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[15px] font-medium">
          <Plus size={17} /> Add fund
        </button>
      </div>

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'plan', label: 'In this budget' },
          { value: 'completed', label: 'Completed' },
        ]}
      />

      {shown.length === 0 && (
        <PCard className="p-5 text-center text-sm text-content-muted">
          {filter === 'completed'
            ? 'Funds you mark complete land here.'
            : filter === 'plan'
              ? "No funds in this month's plan."
              : 'No funds yet — add one for anything you’re saving toward.'}
        </PCard>
      )}

      {shown.map((g) => (
        <FundCard key={g.id} goal={g} planned={planned.get(g.id)} onClick={() => navigate(`/fund/${g.id}`)} />
      ))}

      {adding && (
        <FundEditor
          onClose={() => setAdding(false)}
          onSaved={(g) => {
            setAdding(false);
            void reload();
            navigate(`/fund/${g.id}`);
          }}
        />
      )}
    </div>
  );
}

export function FundCard({
  goal: g,
  planned,
  onClick,
}: {
  goal: SavingsGoal;
  planned?: number;
  onClick: () => void;
}) {
  const p = pct(g.current_amount, g.target_amount);
  const reached = g.current_amount >= g.target_amount;
  return (
    <PCard onClick={onClick} className="px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-3">
        <EmojiAvatar emoji={g.emoji} color={g.color} />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold truncate">{g.name}</div>
          {planned != null && planned > 0 && (
            <div className="text-xs text-content-subtle">+{money(planned)} this month</div>
          )}
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </div>
      <div className="mt-3">
        <HatchedBar pct={p} color={g.color} badge={`${Math.floor(p)}%`} />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[15px] num">
          <span className="font-semibold">{money(g.current_amount)}</span>
          <span className="text-content-muted"> of {money(g.target_amount)}</span>
        </span>
        <span className="text-sm text-content-muted text-right">
          {g.archived ? 'Completed' : reached ? 'Goal reached 🎉' : g.target_date ? `by ${fmtDate(g.target_date, 'd MMM yyyy')}` : 'no deadline'}
        </span>
      </div>
    </PCard>
  );
}
