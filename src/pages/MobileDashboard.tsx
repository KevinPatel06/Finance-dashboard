import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  PiggyBank,
  Plus,
  Receipt,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { fmtMoney, fmtDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { interestPerMonth } from '@/lib/debtMath';
import { useTheme } from '@/lib/theme';
import type { DashboardSnapshot, Debt } from '@shared/types';
import EmptyState from '@/components/ui/EmptyState';
import SegmentedControl from '@/components/ui/SegmentedControl';
import {
  ListRow,
  MobileHeader,
  MobileHero,
  QuickActions,
  RowGroup,
  SectionHeader,
  StatStrip,
} from '@/components/mobile/primitives';

/**
 * The phone home screen. Presentational — Dashboard.tsx owns the fetch and
 * hands the snapshot down, so there's exactly one dashboard request either way.
 *
 * Three compositions share the same hero and sections; the user picks one in
 * Settings (`mobile_home_layout`).
 */
export default function MobileDashboard({ snap }: { snap: DashboardSnapshot }) {
  const { homeLayout } = useTheme();

  const empty =
    snap.billsThisMonth.length === 0 &&
    snap.goalProgress.length === 0 &&
    snap.thisMonth.income === 0;

  if (empty) {
    return (
      <div className="space-y-5">
        <MobileHeader />
        <Hero snap={snap} />
        <EmptyState
          icon={<Sparkles size={26} />}
          title="Let's get started"
          description="Add a few bills and a savings goal, then log your first paycheck."
          action={
            <div className="flex flex-col gap-2 w-full">
              <Link to="/bills" className="btn-primary w-full">
                <Receipt size={16} /> Add bills
              </Link>
              <Link to="/paychecks" className="btn-outline w-full">
                <Wallet size={16} /> Log paycheck
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (homeLayout === 'hero_stats') return <HeroStatsLayout snap={snap} />;
  if (homeLayout === 'hero_tabs') return <HeroTabsLayout snap={snap} />;
  return <HeroActionsLayout snap={snap} />;
}

/* ---------------------------------------------------------------- layouts */

function HeroActionsLayout({ snap }: { snap: DashboardSnapshot }) {
  return (
    <div className="space-y-5">
      <MobileHeader />
      <Hero snap={snap} />
      <QuickActions
        actions={[
          { to: '/paychecks', label: 'Log paycheck', icon: Wallet, primary: true },
          { to: '/expenses', label: 'Add expense', icon: Plus },
        ]}
      />
      <BillsSection snap={snap} />
      <GoalsSection snap={snap} />
    </div>
  );
}

function HeroStatsLayout({ snap }: { snap: DashboardSnapshot }) {
  return (
    <div className="space-y-5">
      <Hero snap={snap} />
      <StatStrip
        stats={[
          { label: 'Income', value: fmtMoney(snap.thisMonth.income), tone: 'brand' },
          { label: 'Bills', value: fmtMoney(snap.thisMonth.billsPaid) },
          { label: 'Saved', value: fmtMoney(snap.thisMonth.savings) },
          { label: 'Fun', value: fmtMoney(snap.thisMonth.fun) },
        ]}
      />
      <BillsSection snap={snap} />
      <GoalsSection snap={snap} />
    </div>
  );
}

type Panel = 'bills' | 'goals' | 'payoff';

function HeroTabsLayout({ snap }: { snap: DashboardSnapshot }) {
  const [panel, setPanel] = useState<Panel>('bills');
  return (
    <div className="space-y-5">
      <MobileHeader />
      <Hero snap={snap} />
      <SegmentedControl<Panel>
        value={panel}
        onChange={setPanel}
        options={[
          { value: 'bills', label: 'Bills' },
          { value: 'goals', label: 'Goals' },
          { value: 'payoff', label: 'Payoff' },
        ]}
      />
      {/* emptyMessage matters here: the user picked this tab, so a blank pane
          would read as broken. In the stacked layouts a missing section is fine. */}
      {panel === 'bills' && (
        <BillsSection
          snap={snap}
          showHeader={false}
          limit={8}
          emptyMessage="No bills this month."
        />
      )}
      {panel === 'goals' && (
        <GoalsSection
          snap={snap}
          showHeader={false}
          limit={8}
          emptyMessage="No savings goals yet."
        />
      )}
      {panel === 'payoff' && <PayoffPanel />}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

/** Average savings per paycheck — deliberately the headline, not a balance. */
function Hero({ snap }: { snap: DashboardSnapshot }) {
  return (
    <MobileHero
      label="Average savings per paycheck"
      value={fmtMoney(snap.averageSavingsPerPaycheck)}
      caption={
        snap.paycheckCount > 0
          ? `Across ${snap.paycheckCount} logged paycheck${snap.paycheckCount === 1 ? '' : 's'}`
          : 'Log a paycheck to start tracking your average'
      }
      aside={
        <div className="inline-flex items-center gap-2 rounded-full bg-surface-2 border border-border px-3 py-1.5">
          <Receipt size={13} className="text-content-muted" />
          <span className="text-[11px] text-content-muted">Avg bills / paycheck</span>
          <span className="text-xs font-semibold num">{fmtMoney(snap.smoothedPerPaycheck)}</span>
        </div>
      }
    />
  );
}

/** Small placeholder for a tab pane the user explicitly opened. */
function PanelEmpty({ message, to, label }: { message: string; to: string; label: string }) {
  return (
    <div className="card p-6 text-center">
      <div className="text-sm text-content-muted">{message}</div>
      <Link to={to} className="btn-outline mt-3">
        <Plus size={16} /> {label}
      </Link>
    </div>
  );
}

function BillsSection({
  snap,
  showHeader = true,
  limit = 4,
  emptyMessage,
}: {
  snap: DashboardSnapshot;
  showHeader?: boolean;
  limit?: number;
  emptyMessage?: string;
}) {
  // Same ordering as the desktop card: overdue, then due soon, paid last.
  const items = [...snap.billsThisMonth].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  if (items.length === 0) {
    return emptyMessage ? (
      <PanelEmpty message={emptyMessage} to="/bills" label="Add a bill" />
    ) : null;
  }

  return (
    <div>
      {showHeader && <SectionHeader title="Bills this month" to="/bills" />}
      <RowGroup>
        {items.slice(0, limit).map((b) => (
          <ListRow
            key={`${b.bill.id}-${b.dueDate}`}
            icon={b.paid ? CheckCircle2 : b.overdue ? AlertTriangle : Receipt}
            color={b.paid ? undefined : (b.category?.color ?? undefined)}
            title={b.bill.name}
            subtitle={
              b.paid ? 'Paid' : b.overdue ? `Overdue · ${fmtDateShort(b.dueDate)}` : fmtDateShort(b.dueDate)
            }
            value={fmtMoney(b.bill.amount)}
            valueTone={b.paid ? 'muted' : b.overdue ? 'danger' : 'default'}
          />
        ))}
      </RowGroup>
    </div>
  );
}

function GoalsSection({
  snap,
  showHeader = true,
  limit = 3,
  emptyMessage,
}: {
  snap: DashboardSnapshot;
  showHeader?: boolean;
  limit?: number;
  emptyMessage?: string;
}) {
  if (snap.goalProgress.length === 0) {
    return emptyMessage ? (
      <PanelEmpty message={emptyMessage} to="/goals" label="Add a goal" />
    ) : null;
  }

  return (
    <div>
      {showHeader && <SectionHeader title="Savings goals" to="/goals" />}
      <RowGroup>
        {snap.goalProgress.slice(0, limit).map(({ goal, pctComplete }) => (
          <div key={goal.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Each goal carries its own colour — same one the Goals page uses. */}
              <div
                className="w-10 h-10 rounded-full grid place-items-center shrink-0"
                style={{ backgroundColor: `${goal.color}1f`, color: goal.color }}
              >
                <PiggyBank size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-medium truncate">{goal.name}</div>
                <div className="text-xs text-content-subtle num">
                  {fmtMoney(goal.current_amount)} of {fmtMoney(goal.target_amount)}
                </div>
              </div>
              <div className="text-sm font-semibold num shrink-0">{Math.round(pctComplete)}%</div>
            </div>
            <div className="mt-2.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, pctComplete)}%`,
                  backgroundColor: goal.color,
                }}
              />
            </div>
          </div>
        ))}
      </RowGroup>
    </div>
  );
}

/** Mirrors the desktop PayoffCard: fetches its own debts, renders nothing without any. */
function PayoffPanel() {
  const [debts, setDebts] = useState<Debt[]>([]);

  useEffect(() => {
    window.api.debts.list().then((d) => setDebts(d as Debt[]));
  }, []);

  if (debts.length === 0) {
    return (
      <div className="card p-6 text-center">
        <div className="text-sm text-content-muted">No debts tracked.</div>
        <Link to="/payoff" className="btn-outline mt-3">
          <TrendingDown size={16} /> Set up payoff
        </Link>
      </div>
    );
  }

  const totalOwed = debts.reduce((a, d) => a + d.current_balance, 0);
  const monthlyInterest = debts.reduce((a, d) => a + interestPerMonth(d), 0);

  return (
    <div className="space-y-3">
      <div className="card p-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-content-muted font-medium">
            Total owed
          </div>
          <div className="text-xl font-display font-semibold num-display">
            {fmtMoney(totalOwed)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-content-muted font-medium">
            Interest / month
          </div>
          <div className="text-xl font-display font-semibold num-display text-danger">
            {fmtMoney(monthlyInterest)}
          </div>
        </div>
      </div>
      <RowGroup>
        {debts.slice(0, 6).map((d) => {
          const pct =
            d.original_amount > 0
              ? Math.min(100, ((d.original_amount - d.current_balance) / d.original_amount) * 100)
              : null;
          return (
            <div key={d.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{d.name}</span>
                <span className="text-sm font-semibold num shrink-0">
                  {fmtMoney(d.current_balance)}
                </span>
              </div>
              {pct !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full bg-brand transition-all')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-content-muted num w-9 text-right">
                    {Math.round(pct)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </RowGroup>
    </div>
  );
}
