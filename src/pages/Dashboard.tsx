import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarClock,
  Receipt,
  PiggyBank,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { fmtMoney, fmtDateShort } from '@/lib/format';
import type { DashboardSnapshot } from '@shared/types';
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
    snap.upcomingBills.length === 0 &&
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
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
          <div className="text-4xl font-bold tracking-tight num">
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
    <div className="card p-5">
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
      <div className="text-2xl font-bold mt-3 num">{value}</div>
    </div>
  );
}

function UpcomingBillsCard({ snap }: { snap: DashboardSnapshot }) {
  return (
    <div className="card p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Upcoming in next 30 days</h2>
        <Link to="/bills" className="text-xs text-brand hover:underline inline-flex items-center gap-1">
          Manage bills <ArrowUpRight size={12} />
        </Link>
      </div>
      {snap.upcomingBills.length === 0 ? (
        <div className="text-sm text-content-muted py-6 text-center">
          No bills coming due in the next 30 days.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {snap.upcomingBills.map((e, i) => (
            <li key={i} className="py-3 flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: e.category?.color ?? '#64748b' }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.bill.name}</div>
                <div className="text-xs text-content-muted">
                  {e.category?.name ?? 'Uncategorized'} · {fmtDateShort(e.dueDate)}
                </div>
              </div>
              <div className="num font-semibold">{fmtMoney(e.bill.amount)}</div>
            </li>
          ))}
        </ul>
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
