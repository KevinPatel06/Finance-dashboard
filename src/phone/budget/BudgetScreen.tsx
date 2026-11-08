import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, PiggyBank } from 'lucide-react';
import type { AppSettings, PaceStatus, RegisteredAccount } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { useApi, useMonth, useRefresh } from '../data';
import { monthLabel, monthName, nextBudgetLabel } from '../dates';
import { money, moneyWhole } from '../format';
import CountUp from '../ui/CountUp';
import Gauge from '../ui/Gauge';
import Sheet from '../ui/Sheet';
import { Banner, BigButton, Chip, EmojiIcon, LargeHeader, PCard } from '../ui/kit';
import PaydayCard from './PaydayCard';
import PlanEditor from './PlanEditor';
import AccountEditor from '../contributions/AccountEditor';
import { cash, KIND_META } from '../contributions/meta';
import SavingGauge from './SavingGauge';
import SavingTab from './SavingTab';
import { depositBanner } from './savingCopy';
import SpendingTab from './SpendingTab';

const PACE: Record<PaceStatus, { label: string; className: string; tone: 'success' | 'warning' | 'danger' }> = {
  on_track: { label: 'On Track', className: 'text-success', tone: 'success' },
  fast: { label: 'Spending fast', className: 'text-warning', tone: 'warning' },
  over: { label: 'Over budget', className: 'text-danger', tone: 'danger' },
};

/** One line of the "how we got this number" sheet: income down to what's left. */
function BreakdownRow({
  label,
  amount,
  minus,
  plus,
  total,
  hero,
}: {
  label: string;
  amount: number;
  minus?: boolean;
  plus?: boolean;
  total?: boolean;
  hero?: 'brand' | 'danger';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-[7px]',
        total ? 'mt-0.5 border-t border-border pt-[9px] font-semibold text-content' : 'text-content-muted'
      )}
    >
      <span>
        {minus ? '− ' : plus ? '+ ' : ''}
        {label}
      </span>
      <span
        className={cn(
          'num',
          minus || plus ? 'font-medium' : 'font-semibold text-content',
          hero === 'brand' && 'text-[17px] text-brand',
          hero === 'danger' && 'text-[17px] text-danger'
        )}
      >
        {money(amount)}
      </span>
    </div>
  );
}

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
          <button className="press [--dip:0.94] text-[15px] font-semibold text-brand" onClick={() => setEditor('edit')}>
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
      </div>

      {tab === 'saving' ? (
        <SavingGauge view={v} />
      ) : (
      <div className="pt-1">
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
        <button
          onClick={() => setInfo(true)}
          className="press mx-auto -mt-1 flex items-center gap-3 rounded-full bg-surface-2 border border-border/70 shadow-card px-5 py-2.5"
        >
          <span className="text-center leading-tight">
            <span className="block text-[15px] font-semibold num">{money(v.safePerDay)} / day safe to spend</span>
            <span className="block text-xs text-content-subtle">
              Tap for the breakdown · Next budget {nextBudgetLabel(v.month)}
            </span>
          </span>
          <Info size={18} className="text-content-muted" />
        </button>
      </div>
      )}

      <SegmentedControl
        className={cn('mt-2')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'saving', label: 'Saving' },
        ]}
      />

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

      <Sheet
        open={info}
        onClose={() => setInfo(false)}
        title={v.leftToSpend < 0 ? `Why you're over by ${money(-v.leftToSpend)}` : `How we got ${money(v.leftToSpend)}`}
      >
        <div className="pb-2 text-[15px]">
          <BreakdownRow label={`Income in ${monthName(v.month)}`} amount={v.income} />
          <BreakdownRow label="Recurring costs" amount={v.recurring.total} minus />
          <BreakdownRow label="Debt payments" amount={v.planned.debt} minus />
          <BreakdownRow label="Savings funds" amount={v.planned.fund} minus />
          {v.planned.contribution > 0 && <BreakdownRow label="Contributions" amount={v.planned.contribution} minus />}
          {unassigned >= 0.01 && <BreakdownRow label="Not assigned yet" amount={unassigned} minus />}
          {unassigned <= -0.01 && <BreakdownRow label="Planned beyond income" amount={-unassigned} plus />}
          <BreakdownRow label="Spending plan" amount={v.planned.spend} total />
          <BreakdownRow label="Spent so far" amount={v.spent.total} minus />
          <BreakdownRow
            label={v.leftToSpend < 0 ? 'Over by' : 'Left to spend'}
            amount={Math.abs(v.leftToSpend)}
            total
            hero={v.leftToSpend < 0 ? 'danger' : 'brand'}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-content-subtle">
            {v.daysLeft > 0 && v.leftToSpend > 0 && (
              <>
                That's {money(v.safePerDay)} a day for the {v.daysLeft} day{v.daysLeft === 1 ? '' : 's'} left in{' '}
                {monthName(v.month)}.{' '}
              </>
            )}
            Recurring charges, purchases paid from a fund, and RRSP/TFSA/FHSA contributions don't count as spending
            here. They're already covered above.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
