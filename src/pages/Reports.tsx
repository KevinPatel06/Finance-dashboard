import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import { BarChart3, ShoppingCart, TrendingDown, TrendingUp, Minus, Download } from 'lucide-react';
import { exportCsv } from '@/lib/csv';
import type { ExpenseReport } from '@shared/types';

type Tab = 'overview' | 'expenses';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-5">
      {/* Tab toggle */}
      <div className="inline-flex rounded-lg border border-border bg-surface-3 p-1">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
          <BarChart3 size={15} /> Overview
        </TabButton>
        <TabButton active={tab === 'expenses'} onClick={() => setTab('expenses')}>
          <ShoppingCart size={15} /> Expenses
        </TabButton>
      </div>

      {tab === 'overview' ? <OverviewReports /> : <ExpenseReports />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition',
        active
          ? 'bg-surface-2 text-content shadow-soft'
          : 'text-content-muted hover:text-content'
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Overview — existing reports (paychecks/bills/savings). Unchanged behavior.
// ============================================================================

interface CatRow {
  id: number | null;
  name: string;
  color: string;
  total: number;
}
interface MonthRow {
  month: string;
  income: number;
  bills: number;
  savings: number;
  fun: number;
}

function OverviewReports() {
  const [cats, setCats] = useState<CatRow[]>([]);
  const [months, setMonths] = useState<MonthRow[]>([]);

  useEffect(() => {
    const now = new Date();
    const s = format(startOfMonth(now), 'yyyy-MM-dd');
    const e = format(endOfMonth(now), 'yyyy-MM-dd');
    window.api.reports.categories(s, e).then((d) => setCats(d as CatRow[]));
    window.api.reports.monthly(6).then((d) => setMonths(d as MonthRow[]));
  }, []);

  const hasCatData = cats.some((c) => c.total > 0);
  const hasMonthData = months.some((m) => m.income + m.bills + m.savings + m.fun > 0);

  if (!hasCatData && !hasMonthData) {
    return (
      <EmptyState
        icon={<BarChart3 size={26} />}
        title="No data to chart yet"
        description="Log a paycheck or two and your reports will start to fill in."
      />
    );
  }

  const savingsRate = months.map((m) => ({
    month: m.month,
    rate: m.income > 0 ? Math.round((m.savings / m.income) * 100) : 0,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <h2 className="font-semibold mb-3">This month — bills by category</h2>
        {hasCatData ? (
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={cats.filter((c) => c.total > 0)}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={100}
                  innerRadius={55}
                  paddingAngle={2}
                  stroke="none"
                  label={(d: any) => d.name}
                >
                  {cats.map((c, i) => (
                    <Cell key={i} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 grid place-items-center text-sm text-content-muted">
            No bills paid this month yet.
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Last 6 months — flow</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="month" stroke="rgb(var(--content-muted))" fontSize={12} />
              <YAxis stroke="rgb(var(--content-muted))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--surface-2))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 8,
                }}
                formatter={(v: any) => fmtMoney(Number(v))}
              />
              <Legend />
              <Bar dataKey="income" fill="rgb(var(--info))" name="Income" radius={[4, 4, 0, 0]} />
              <Bar dataKey="bills" fill="rgb(var(--danger))" name="Bills" radius={[4, 4, 0, 0]} />
              <Bar dataKey="savings" fill="rgb(var(--brand))" name="Savings" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fun" fill="rgb(var(--warning))" name="Fun" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-5 lg:col-span-2">
        <h2 className="font-semibold mb-3">Savings rate</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={savingsRate}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="month" stroke="rgb(var(--content-muted))" fontSize={12} />
              <YAxis stroke="rgb(var(--content-muted))" fontSize={12} unit="%" />
              <Tooltip
                contentStyle={{
                  background: 'rgb(var(--surface-2))',
                  border: '1px solid rgb(var(--border))',
                  borderRadius: 8,
                }}
                formatter={(v: any) => `${v}%`}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="rgb(var(--brand))"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Expenses — separate ledger reporting with its own time range.
// ============================================================================

type Range = 'month' | 'lastMonth' | '6months' | 'year' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  month: 'This month',
  lastMonth: 'Last month',
  '6months': '6 months',
  year: '1 year',
  all: 'All time',
};

const monthRange = (d: Date) => ({
  from: format(startOfMonth(d), 'yyyy-MM-dd'),
  to: format(endOfMonth(d), 'yyyy-MM-dd'),
});

function rangeToDates(range: Range): { from: string; to: string } {
  const now = new Date();
  switch (range) {
    case 'month':
      return monthRange(now);
    case 'lastMonth':
      return monthRange(subMonths(now, 1));
    case '6months':
      return {
        from: format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    case 'year':
      return {
        from: format(startOfMonth(subMonths(now, 11)), 'yyyy-MM-dd'),
        to: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31' };
  }
}

/**
 * For single-month views, the prior month to compare against + a friendly label.
 * Returns null for multi-month ranges (no comparison shown).
 */
function comparisonInfo(
  range: Range
): { prior: { from: string; to: string }; priorLabel: string; isCurrentMonth: boolean } | null {
  const now = new Date();
  if (range === 'month') {
    return { prior: monthRange(subMonths(now, 1)), priorLabel: 'last month', isCurrentMonth: true };
  }
  if (range === 'lastMonth') {
    const before = subMonths(now, 2);
    return { prior: monthRange(before), priorLabel: format(before, 'MMMM'), isCurrentMonth: false };
  }
  return null;
}

type Tone = 'good' | 'bad' | 'neutral';

function buildComparison(
  current: number,
  prior: number,
  priorLabel: string,
  isCurrentMonth: boolean
): { tone: Tone; headline: string; body: string } {
  const soFar = isCurrentMonth ? ' so far' : '';
  const caveat = isCurrentMonth ? " (the month's still in progress)" : '';

  if (prior === 0) {
    return {
      tone: 'neutral',
      headline: 'No prior month to compare',
      body: `There's nothing logged for ${priorLabel} to measure against yet.`,
    };
  }

  const delta = current - prior;
  if (delta === 0) {
    return {
      tone: 'neutral',
      headline: `Even with ${priorLabel}`,
      body: `You've spent exactly the same${soFar} as ${priorLabel}.`,
    };
  }

  const pct = Math.round((Math.abs(delta) / prior) * 100);
  const amt = fmtMoney(Math.abs(delta));

  if (delta < 0) {
    // Spending less — praise.
    return pct >= 25
      ? {
          tone: 'good',
          headline: `Down ${amt} vs ${priorLabel} 🎉`,
          body: `You're spending ${pct}% less${soFar} than ${priorLabel}. That's real discipline — keep it going!${caveat}`,
        }
      : {
          tone: 'good',
          headline: `Down ${amt} vs ${priorLabel} 👏`,
          body: `Spending's ${pct}% lower${soFar} than ${priorLabel}. Nice — small wins add up.${caveat}`,
        };
  }

  // Spending more — reality check.
  return pct >= 25
    ? {
        tone: 'bad',
        headline: `Up ${amt} vs ${priorLabel} ⚠️`,
        body: `That's ${pct}% more${soFar} than ${priorLabel} — a steep jump. Worth a hard look at where it's going before it becomes a habit.${caveat}`,
      }
    : {
        tone: 'bad',
        headline: `Up ${amt} vs ${priorLabel}`,
        body: `You're ${pct}% over${soFar} ${priorLabel}. Not huge, but you can do better — rein it in next month.${caveat}`,
      };
}

function ComparisonBanner({
  current,
  prior,
  priorLabel,
  isCurrentMonth,
}: {
  current: number;
  prior: number;
  priorLabel: string;
  isCurrentMonth: boolean;
}) {
  const c = buildComparison(current, prior, priorLabel, isCurrentMonth);
  const Icon = c.tone === 'good' ? TrendingDown : c.tone === 'bad' ? TrendingUp : Minus;
  const iconClass =
    c.tone === 'good'
      ? 'bg-success/15 text-success'
      : c.tone === 'bad'
        ? 'bg-danger/15 text-danger'
        : 'bg-surface-3 text-content-muted';

  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-xl grid place-items-center shrink-0', iconClass)}>
        <Icon size={20} />
      </div>
      <div>
        <div className="font-semibold">{c.headline}</div>
        <div className="text-sm text-content-muted mt-0.5 leading-relaxed">{c.body}</div>
      </div>
    </div>
  );
}

function ExpenseReports() {
  const [range, setRange] = useState<Range>('month');
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [priorTotal, setPriorTotal] = useState<number | null>(null);

  useEffect(() => {
    const { from, to } = rangeToDates(range);
    window.api.reports.expenses(from, to).then((d) => setReport(d as ExpenseReport));

    const cmp = comparisonInfo(range);
    if (cmp) {
      setPriorTotal(null);
      window.api.reports
        .expenses(cmp.prior.from, cmp.prior.to)
        .then((d) => setPriorTotal((d as ExpenseReport).totalSpent));
    } else {
      setPriorTotal(null);
    }
  }, [range]);

  const cmp = comparisonInfo(range);
  const isSingleMonth = !!cmp;
  const hasData = !!report && report.count > 0;

  const overTimeData =
    report?.overTime.map((r) => ({
      label: format(parseISO(`${r.month}-01`), 'MMM yy'),
      total: r.total,
    })) ?? [];

  const exportReport = async () => {
    if (!report) return;
    const rows = report.byCategory
      .filter((c) => c.total > 0)
      .map((c) => [c.name, c.total.toFixed(2)]);
    rows.push(['Total', report.totalSpent.toFixed(2)]);
    await exportCsv(
      `expense-report-${range}-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      ['Category', 'Spent (CAD)'],
      rows
    );
  };

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-content-muted">
          Showing expenses for{' '}
          <span className="text-content font-medium">{RANGE_LABELS[range]}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <button
              onClick={exportReport}
              className="btn-outline"
              title="Export this breakdown to CSV"
            >
              <Download size={16} /> Export CSV
            </button>
          )}
          <div className="inline-flex rounded-lg border border-border bg-surface-3 p-1">
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition',
                  range === r
                    ? 'bg-surface-2 text-content shadow-soft'
                    : 'text-content-muted hover:text-content'
                )}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report &&
        (!hasData && !isSingleMonth ? (
          <EmptyState
            icon={<ShoppingCart size={26} />}
            title="No expenses in this period"
            description="Log some purchases on the Expenses page, or pick a wider time range."
          />
        ) : (
          <>
            {/* Total spent headline */}
            <div className="card p-6 bg-gradient-to-br from-surface-2 to-surface-3 relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-brand/10 blur-3xl" />
              <div className="relative">
                <div className="text-xs uppercase tracking-wider text-content-muted font-medium mb-1">
                  Total spent · {RANGE_LABELS[range]}
                </div>
                <div className="text-4xl font-display font-semibold tracking-tight num-display text-content">
                  {fmtMoney(report.totalSpent)}
                </div>
                <div className="text-sm text-content-muted mt-1">
                  across {report.count} purchase{report.count === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {/* Month-over-month comparison */}
            {isSingleMonth && cmp && priorTotal !== null && (
              <ComparisonBanner
                current={report.totalSpent}
                prior={priorTotal}
                priorLabel={cmp.priorLabel}
                isCurrentMonth={cmp.isCurrentMonth}
              />
            )}

            {hasData ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Pie by category */}
                  <div className="card p-5">
                    <h2 className="font-semibold mb-3">By category</h2>
                    <div className="h-72">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={report.byCategory.filter((c) => c.total > 0)}
                            dataKey="total"
                            nameKey="name"
                            outerRadius={100}
                            innerRadius={55}
                            paddingAngle={2}
                            stroke="none"
                            label={(d: any) => d.name}
                          >
                            {report.byCategory.map((c, i) => (
                              <Cell key={i} fill={c.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Spending over time */}
                  <div className="card p-5">
                    <h2 className="font-semibold mb-3">Spending over time</h2>
                    <div className="h-72">
                      <ResponsiveContainer>
                        <BarChart data={overTimeData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                          <XAxis dataKey="label" stroke="rgb(var(--content-muted))" fontSize={12} />
                          <YAxis stroke="rgb(var(--content-muted))" fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              background: 'rgb(var(--surface-2))',
                              border: '1px solid rgb(var(--border))',
                              borderRadius: 8,
                            }}
                            formatter={(v: any) => fmtMoney(Number(v))}
                          />
                          <Bar
                            dataKey="total"
                            fill="rgb(var(--brand))"
                            name="Spent"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Top purchases */}
                <div className="card p-5">
                  <h2 className="font-semibold mb-3">Top purchases</h2>
                  <ul className="divide-y divide-border">
                    {report.topPurchases.map((p, i) => (
                      <li key={p.id} className="py-3 flex items-center gap-3">
                        <span className="text-content-subtle num w-5 text-sm">{i + 1}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.categoryColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.description}</div>
                          <div className="text-xs text-content-muted">
                            {p.categoryName} · {format(parseISO(p.date), 'MMM d, yyyy')}
                          </div>
                        </div>
                        <div className="num font-semibold">{fmtMoney(p.amount)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="card p-8 text-center text-sm text-content-muted">
                No purchases logged for {RANGE_LABELS[range].toLowerCase()} yet.
              </div>
            )}
          </>
        ))}
    </div>
  );
}
