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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { fmtMoney } from '@/lib/format';
import EmptyState from '@/components/ui/EmptyState';
import { BarChart3 } from 'lucide-react';

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

export default function Reports() {
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
