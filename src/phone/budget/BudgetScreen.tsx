import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, PiggyBank, TrendingDown, TrendingUp } from 'lucide-react';
import type { AppSettings, PaceStatus, RegisteredAccount } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { useApi, useMonth, useRefresh } from '../data';
import { monthLabel, monthName } from '../dates';
import { money, moneyWhole } from '../format';
import CountUp from '../ui/CountUp';
import Gauge from '../ui/Gauge';
import { Banner, BigButton, Chip, EmojiIcon, LargeHeader, PCard } from '../ui/kit';
import PaydayCard from './PaydayCard';
import PlanEditor from './PlanEditor';
import AccountEditor from '../contributions/AccountEditor';
import { cash, KIND_META } from '../contributions/meta';
import BreakdownSheet from './BreakdownSheet';
import NeedsYou from './NeedsYou';
import SavingSummary from './SavingSummary';
import SavingTab from './SavingTab';
import { depositBanner } from './savingCopy';
import SpendingTab from './SpendingTab';

const PACE: Record<PaceStatus, { label: string; chip: string; tone: 'success' | 'warning' | 'danger' }> = {
  on_track: { label: 'On track', chip: 'bg-brand-soft text-brand-ink', tone: 'success' },
  fast: { label: 'Spending fast', chip: 'bg-warning/15 text-warning-ink', tone: 'warning' },
  over: { label: 'Over budget', chip: 'bg-danger/10 text-danger', tone: 'danger' },
};

/** The phone's home: how much is safe to spend this month, and where it's going. */
export default function BudgetScreen() {
  const navigate = useNavigate();
  const { data: v, reload } = useMonth();
  const { bump } = useRefresh();
  const { data: settings } = useApi<AppSettings>(() => window.api.settings.get());
  const [tab, setTab] = useState<'spending' | 'saving'>('spending');
  const [editor, setEditor] = useState<null | 'edit' | 'review'>(null);
  const [info, setInfo] = useState(false);
  const { data: accounts } = useApi<RegisteredAccount[]>(() => window.api.registered.list());
  const [newYear, setNewYear] = useState<RegisteredAccount | null>(null);

  if (!v) return <div className="pt-24 text-center text-content-subtle">Loading…</div>;
  const deposit = depositBanner(v);

  if (v.status === 'none') {
    return (
      <div className="space-y-5">
        <LargeHeader title="Budget" subtitle={<span className="text-content-muted">{monthLabel(v.month)}</span>} />
        <PCard className="p-6 text-center">
          <div className="mb-3 flex justify-center text-brand">
            <EmojiIcon emoji="🗓️" size={48} strokeWidth={1.6} />
          </div>
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
  const PaceIcon = v.pace === 'on_track' ? TrendingDown : TrendingUp;
  const fraction = v.planned.spend > 0 ? Math.max(0, v.leftToSpend) / v.planned.spend : 0;
  const unassigned = Math.round(v.leftToAllocate * 100) / 100;

  return (
    <div className="space-y-4">
      <LargeHeader
        title="Budget"
        subtitle={
          <span className="flex items-center gap-2.5">
            <span className={cn('inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-sm font-semibold', pace.chip)}>
              <PaceIcon size={14} strokeWidth={2.5} aria-hidden />
              {pace.label}
            </span>
            <span className="text-content-muted font-normal text-[15px]">{monthLabel(v.month)}</span>
          </span>
        }
        right={
          <button
            className="press [--dip:0.94] min-h-11 px-1 text-base font-semibold text-brand-ink"
            onClick={() => setEditor('edit')}
          >
            Edit plan
          </button>
        }
      />

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'saving', label: 'Saving' },
        ]}
      />

      {tab === 'saving' ? (
        <SavingSummary view={v} />
      ) : (
        <PCard className="px-4 pt-3 pb-1.5">
          <button
            onClick={() => setInfo(true)}
            aria-label={`${v.leftToSpend < 0 ? 'Over by' : 'Left to spend'} ${money(Math.abs(v.leftToSpend))}. Show the breakdown`}
            className="press [--dip:0.98] block w-full"
          >
            <Gauge
              fraction={fraction}
              tone={pace.tone}
              label={v.leftToSpend < 0 ? 'Over by' : 'Left to spend'}
              value={<CountUp value={Math.abs(v.leftToSpend)} format={moneyWhole} />}
              sub={v.planned.spend > 0 ? `of ${moneyWhole(v.planned.spend)} spending plan` : undefined}
            />
          </button>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-semibold num">
              {v.leftToSpend > 0 && v.daysLeft > 0
                ? `${money(v.safePerDay)} a day · ${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'} left`
                : `${v.daysLeft} day${v.daysLeft === 1 ? '' : 's'} left`}
            </span>
            <button
              onClick={() => setInfo(true)}
              className="press [--dip:0.94] min-h-11 inline-flex items-center gap-0.5 pl-3 text-[15px] font-semibold text-brand"
            >
              Breakdown <ChevronRight size={18} strokeWidth={2.2} />
            </button>
          </div>
        </PCard>
      )}

      <NeedsYou>
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
        {deposit && (
          <Banner
            tone="brand"
            icon={<PiggyBank size={20} />}
            title={deposit.title}
            action={
              <Chip active onClick={() => setTab('saving')}>
                Log deposits
              </Chip>
            }
          >
            {deposit.body}
          </Banner>
        )}
        {(accounts ?? [])
          .filter((a) => a.waiting && a.kind !== 'rrsp' && !a.new_year_snoozed && a.suggestion)
          .map((a) => (
            <Banner
              key={`ny-${a.id}`}
              tone="brand"
              icon="🗓️"
              title={`Start your ${a.suggestion!.tax_year} ${KIND_META[a.kind].label} year`}
              onClick={() => setNewYear(a)}
            >
              Your new room is ready to check. It takes a few seconds.
            </Banner>
          ))}
        {(accounts ?? [])
          .filter((a) => a.kind === 'rrsp' && a.waiting && a.summary_pending)
          .map((a) => {
            const y = a.summary_pending!;
            return (
              <Banner
                key={`sum-${a.id}`}
                tone="brand"
                icon="🏁"
                title={`Your ${y.tax_year} RRSP year is done`}
                action={
                  <Chip
                    active
                    onClick={async () => {
                      await window.api.registered.ackSummary(a.id);
                      bump();
                    }}
                  >
                    Got it
                  </Chip>
                }
              >
                You put in {cash(y.contributed)}
                {y.goal ? ` of your ${cash(y.goal)} goal` : ''}. Add your {y.tax_year + 1} room when your Notice of
                Assessment arrives.
              </Banner>
            );
          })}
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
      </NeedsYou>

      <div key={tab} className="animate-page-in">
        {tab === 'spending' ? <SpendingTab view={v} onEditPlan={() => setEditor('edit')} /> : <SavingTab view={v} />}
      </div>

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

      {newYear && (
        <AccountEditor
          mode="newYear"
          account={newYear}
          onClose={() => setNewYear(null)}
          onSaved={() => {
            setNewYear(null);
            void reload();
          }}
        />
      )}

      <BreakdownSheet view={v} open={info} onClose={() => setInfo(false)} onFix={() => setEditor('edit')} />
    </div>
  );
}
