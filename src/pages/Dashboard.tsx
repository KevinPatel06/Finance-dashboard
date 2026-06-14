import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  Receipt,
  PiggyBank,
  Sparkles,
  Wallet,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { fmtMoney, fmtDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { interestPerMonth } from '@/lib/debtMath';
import type { DashboardSnapshot, Debt } from '@shared/types';
import EmptyState from '@/components/ui/EmptyState';

export default function Dashboard() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);

  useEffect(() => {
    window.api.dashboard.get().then((s) => setSnap(s as DashboardSnapshot));
  }, []);

  if (!snap) {
    return <div className="text-content-muted">Loading…</div>;
  }

  const empty =
    snap.billsThisMonth.length === 0 &&
    snap.goalProgress.length === 0 &&
    snap.thisMonth.income === 0;

  if (empty) {
    return (
      <div className="space-y-6">
        <Hero snap={snap} />
        <EmptyState
          icon={<Sparkles size={26} />}
          title="Let's get started"
          description="Add a few bills and a savings goal, then log your first paycheck to see your dashboard come to life."
          action={
            <div className="flex gap-2">
              <Link to="/bills" className="btn-primary">
                <Receipt size={16} /> Add bills
              </Link>
              <Link to="/goals" className="btn-outline">
                <PiggyBank size={16} /> Add goals
              </Link>
              <Link to="/paychecks" className="btn-outline">
                <Wallet size={16} /> Log paycheck
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Hero snap={snap} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 stagger">
        <StatCard
          label="This month income"
          value={fmtMoney(snap.thisMonth.income)}
          icon={<Wallet size={18} />}
          tone="brand"
        />
        <StatCard
          label="Bills paid"
          value={fmtMoney(snap.thisMonth.billsPaid)}
          icon={<Receipt size={18} />}
        />
        <StatCard
          label="To savings"
          value={fmtMoney(snap.thisMonth.savings)}
          icon={<PiggyBank size={18} />}
        />
        <StatCard
          label="Fun money"
          value={fmtMoney(snap.thisMonth.fun)}
          icon={<Sparkles size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <UpcomingBillsCard snap={snap} />
        <GoalsCard snap={snap} />
      </div>

      <DebtSummaryCard />
    </div>
  );
}

function DebtSummaryCard() {
  const [debts, setDebts] = useState<Debt[]>([]);

  useEffect(() => {
    window.api.debts.list().then((d) => setDebts(d as Debt[]));
  }, []);

  if (debts.length === 0) return null;

  const totalOwed = debts.reduce((a, d) => a + d.current_balance, 0);
  const monthlyInterest = debts.reduce((a, d) => a + interestPerMonth(d), 0);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Payoff progress</h2>
        <Link
          to="/payoff"
          className="text-xs text-brand hover:underline inline-flex items-center gap-1"
        >
          View payoff plan <ArrowUpRight size={12} />
        </Link>
      </div>
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex gap-8">
          <div>
            <div className="text-xs text-content-muted uppercase tracking-wide">Total owed</div>
            <div className="text-2xl font-display font-semibold num-display">{fmtMoney(totalOwed)}</div>
          </div>
          <div>
            <div className="text-xs text-content-muted uppercase tracking-wide">
              Interest / month
            </div>
            <div className="text-2xl font-display font-semibold num-display text-danger">{fmtMoney(monthlyInterest)}</div>
          </div>
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {debts.slice(0, 3).map((d) => {
            const pct =
              d.original_amount > 0 && d.original_amount >= d.current_balance
                ? ((d.original_amount - d.current_balance) / d.original_amount) * 100
                : null;
            return (
              <div key={d.id} className="flex items-center gap-3 text-sm">
                <span className="w-32 truncate font-medium">{d.name}</span>
                {pct !== null ? (
                  <>
                    <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="num text-xs text-content-muted w-12 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <span className="num text-content-muted flex-1 text-right">
                    {fmtMoney(d.current_balance)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Hero({ snap }: { snap: DashboardSnapshot }) {
  const hasHistory = snap.paycheckCount > 0;
  return (
    <div className="card p-6 lg:p-8 bg-gradient-to-br from-surface-2 to-surface-3 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-content-muted font-medium mb-2">
            Average savings per paycheck
          </div>
          <div className="text-5xl font-display font-semibold tracking-tight num-display text-content">
            {fmtMoney(snap.averageSavingsPerPaycheck)}
          </div>
          <div className="text-sm text-content-muted mt-1">
            {hasHistory
              ? `What you've been putting toward savings goals, averaged across your ${snap.paycheckCount} logged paycheck${snap.paycheckCount === 1 ? '' : 's'}`
              : 'Log a paycheck to start tracking your savings average'}
          </div>
          <div className="mt-4 inline-flex items-center gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2">
            <div className="w-7 h-7 rounded-md bg-surface-3 text-content-muted grid place-items-center">
              <Receipt size={14} />
            </div>
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-wider text-content-subtle font-medium">
                Avg bills per paycheck
              </div>
              <div className="text-sm font-semibold num">{fmtMoney(snap.smoothedPerPaycheck)}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="card bg-surface-2 px-4 py-3 flex items-center gap-3">
            <CalendarClock size={18} className="text-brand" />
            <div className="text-sm">
              <div className="text-content-muted text-xs">Next paycheck</div>
              <div className="font-semibold num">
                {snap.nextPaycheckDate
                  ? `${fmtDateShort(snap.nextPaycheckDate)}${
                      snap.daysUntilNextPaycheck != null
                        ? ` · ${snap.daysUntilNextPaycheck}d`
                        : ''
                    }`
                  : 'Not set'}
              </div>
            </div>
          </div>
          <Link to="/paychecks" className="btn-primary">
            <Wallet size={16} /> Log paycheck
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'brand';
}) {
  return (
    <div className="card card-hover p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs text-content-muted uppercase tracking-wide font-medium">
          {label}
        </div>
        <div
          className={
            tone === 'brand'
              ? 'text-brand bg-brand/10 p-1.5 rounded-lg'
              : 'text-content-muted bg-surface-3 p-1.5 rounded-lg'
          }
        >
          {icon}
        </div>
      </div>
      <div className="text-2xl font-display font-semibold mt-3 num-display">{value}</div>
    </div>
  );
}

function UpcomingBillsCard({ snap }: { snap: DashboardSnapshot }) {
  const items = snap.billsThisMonth;
  const overdueCount = items.filter((e) => e.overdue).length;
  const unpaidCount = items.filter((e) => !e.paid).length;

  return (
    <div className="card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Bills to pay this month</h2>
          {overdueCount > 0 && (
            <span className="pill bg-danger/15 text-danger">
              <AlertTriangle size={10} /> {overdueCount} overdue
            </span>
          )}
        </div>
        <Link to="/bills" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
          Manage bills <ArrowUpRight size={12} />
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-content-muted py-6 text-center">
          No bills due this month.
        </div>
      ) : (
        <>
          {unpaidCount === 0 && (
            <div className="text-sm text-success mb-2 flex items-center gap-2">
              <CheckCircle2 size={15} /> All this month's bills are paid — nice work!
            </div>
          )}
          <ul className="divide-y divide-border">
            {items.map((e, i) => (
              <li
                key={i}
                className={cn(
                  'py-3 flex items-center gap-3',
                  e.paid && 'opacity-55'
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: e.category?.color ?? '#64748b' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {e.bill.name}
                    {e.overdue && (
                      <span className="pill bg-danger/15 text-danger shrink-0">
                        <AlertTriangle size={10} /> Overdue
                      </span>
                    )}
                    {e.paid && (
                      <span className="pill bg-success/15 text-success shrink-0">
                        <CheckCircle2 size={10} /> Up to date
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      'text-xs',
                      e.overdue ? 'text-danger' : 'text-content-muted'
                    )}
                  >
                    {e.category?.name ?? 'Uncategorized'} ·{' '}
                    {e.paid ? 'paid · due ' : e.overdue ? 'was due ' : 'due '}
                    {fmtDateShort(e.dueDate)}
                  </div>
                </div>
                <div className={cn('num font-semibold', e.paid && 'line-through')}>
                  {fmtMoney(e.bill.amount)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function GoalsCard({ snap }: { snap: DashboardSnapshot }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Savings goals</h2>
        <Link to="/goals" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
          Manage <ArrowUpRight size={12} />
        </Link>
      </div>
      {snap.goalProgress.length === 0 ? (
        <div className="text-sm text-content-muted py-6 text-center">No goals yet.</div>
      ) : (
        <div className="space-y-4">
          {snap.goalProgress.slice(0, 4).map(({ goal, pctComplete }) => (
            <div key={goal.id}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <div className="font-medium truncate">{goal.name}</div>
                <div className="num text-content-muted">
                  {fmtMoney(goal.current_amount)} / {fmtMoney(goal.target_amount)}
                </div>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pctComplete}%`,
                    backgroundColor: goal.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
