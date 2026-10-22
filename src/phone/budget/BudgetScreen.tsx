import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import type { AppSettings, PaceStatus } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { useApi, useMonth } from '../data';
import { monthLabel, monthName, nextBudgetLabel } from '../dates';
import { money, moneyWhole } from '../format';
import Gauge from '../ui/Gauge';
import Sheet from '../ui/Sheet';
import { Banner, BigButton, Chip, LargeHeader, PCard } from '../ui/kit';
import PaydayCard from './PaydayCard';
import PlanEditor from './PlanEditor';
import SavingTab from './SavingTab';
import SpendingTab from './SpendingTab';

const PACE: Record<PaceStatus, { label: string; className: string; tone: 'success' | 'warning' | 'danger' }> = {
  on_track: { label: 'On Track', className: 'text-success', tone: 'success' },
  fast: { label: 'Spending fast', className: 'text-warning', tone: 'warning' },
  over: { label: 'Over budget', className: 'text-danger', tone: 'danger' },
};

/** The phone's home: how much is safe to spend this month, and where it's going. */
export default function BudgetScreen() {
  const navigate = useNavigate();
  const { data: v, reload } = useMonth();
  const { data: settings } = useApi<AppSettings>(() => window.api.settings.get());
  const [tab, setTab] = useState<'spending' | 'saving'>('spending');
  const [editor, setEditor] = useState<null | 'edit' | 'review'>(null);
  const [info, setInfo] = useState(false);

  if (!v) return <div className="pt-24 text-center text-content-subtle">Loading…</div>;

  if (v.status === 'none') {
    return (
      <div className="space-y-5">
        <LargeHeader title="Budget" subtitle={<span className="text-content-muted">{monthLabel(v.month)}</span>} />
        <PCard className="p-6 text-center">
          <div className="text-5xl mb-3">🗓️</div>
          <h2 className="text-xl font-display font-bold">Set up your monthly budget</h2>
          <p className="text-sm text-content-muted mt-2 mb-6">
            Tell us your pay, your recurring costs and any debts, then give every dollar a job. It takes a
            few minutes and you can change everything later.
          </p>
          <BigButton onClick={() => navigate('/setup')}>Set up my budget</BigButton>
        </PCard>
      </div>
    );
  }

  const pace = PACE[v.pace];
  const fraction = v.planned.spend > 0 ? Math.max(0, v.leftToSpend) / v.planned.spend : 0;
  const unassigned = Math.round(v.leftToAllocate * 100) / 100;

  return (
    <div className="space-y-4">
      <LargeHeader
        title="Budget"
        subtitle={
          <>
            <span className={pace.className}>{pace.label}</span>
            <span className="text-content-subtle"> · </span>
            <span>{monthLabel(v.month)}</span>
          </>
        }
        right={
          <button className="text-[15px] font-semibold text-brand" onClick={() => setEditor('edit')}>
            Edit plan
          </button>
        }
      />

      <div className="space-y-2.5">
        {v.status === 'draft' && (
          <Banner
            tone="brand"
            icon="🗓️"
            title={`Start your ${monthName(v.month)} budget`}
            action={
              <Chip active onClick={() => setEditor('review')}>
                Review & confirm
              </Chip>
            }
          >
            It's a copy of last month's plan. Funds and debt payments are added once you confirm it.
          </Banner>
        )}
        {v.pendingPaydays.map((p) => (
          <PaydayCard key={p.date} payday={p} view={v} onDone={reload} />
        ))}
        {settings && settings.pay_amount == null && (
          <Banner tone="neutral" icon="💵" title="Add your pay" onClick={() => navigate('/settings')}>
            Your income is worked out from your paychecks. Add how much you get paid and how often.
          </Banner>
        )}
        {Math.abs(unassigned) >= 0.01 && (
          <Banner
            tone={unassigned < 0 ? 'danger' : 'neutral'}
            icon={unassigned < 0 ? '✂️' : '🪙'}
            title={
              unassigned < 0
                ? `You've planned ${money(-unassigned)} more than you have`
                : `${money(unassigned)} isn't assigned yet`
            }
            onClick={() => setEditor('edit')}
          >
            {unassigned < 0
              ? 'Trim a category, a fund or a debt payment so the plan adds up.'
              : 'Give it a job — a fund, a debt payment, or spending.'}
          </Banner>
        )}
        {v.wantsEatingNeeds && (
          <Banner tone="warning" icon="⚠️" title="Wants are eating into your Needs">
            You've spent {money(v.spent.wants)} on wants against {money(v.planned.wants)} planned.
          </Banner>
        )}
      </div>

      <div className="pt-1">
        <Gauge
          fraction={fraction}
          tone={pace.tone}
          label={v.leftToSpend < 0 ? 'Over by' : 'Left to spend'}
          value={moneyWhole(Math.abs(v.leftToSpend))}
        />
        <button
          onClick={() => setInfo(true)}
          className="mx-auto -mt-1 flex items-center gap-3 rounded-full bg-surface-2 border border-border/70 shadow-card px-5 py-2.5"
        >
          <span className="text-center leading-tight">
            <span className="block text-[15px] font-semibold num">{money(v.safePerDay)} / day safe to spend</span>
            <span className="block text-xs text-content-subtle">Next budget {nextBudgetLabel(v.month)}</span>
          </span>
          <Info size={18} className="text-content-muted" />
        </button>
      </div>

      <SegmentedControl
        className={cn('mt-2')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'saving', label: 'Saving' },
        ]}
      />

      {tab === 'spending' ? <SpendingTab view={v} onEditPlan={() => setEditor('edit')} /> : <SavingTab view={v} />}

      {editor && (
        <PlanEditor
          view={v}
          review={editor === 'review'}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void reload();
          }}
        />
      )}

      <Sheet open={info} onClose={() => setInfo(false)} title="Safe to spend">
        <div className="space-y-3 text-[15px] leading-relaxed text-content-muted pb-2">
          <p>
            <span className="text-content font-semibold">{money(v.safePerDay)} a day</span> is what's left of your
            spending money ({money(Math.max(0, v.leftToSpend))}) spread over the {v.daysLeft} day
            {v.daysLeft === 1 ? '' : 's'} left in {monthName(v.month)}.
          </p>
          <p>
            Recurring costs, debt payments and savings are already taken off the top, so this number is money you
            can actually use. Purchases paid from a fund don't count against it.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
