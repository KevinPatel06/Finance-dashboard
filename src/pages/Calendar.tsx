import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/format';
import type { Bill, Category } from '@shared/types';

interface CalendarData {
  upcoming: { bill: Bill; dueDate: string; category: Category | null }[];
  paid: { date: string; bill_id: number; bill_name: string; amount: number }[];
  paychecks: { id: number; date: string; amount: number }[];
}

export default function CalendarView() {
  const [cursor, setCursor] = useState(new Date());
  const [data, setData] = useState<CalendarData | null>(null);

  const startGrid = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const endGrid = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });

  useEffect(() => {
    const from = format(startGrid, 'yyyy-MM-dd');
    const to = format(endGrid, 'yyyy-MM-dd');
    window.api.calendar.events(from, to).then((d) => setData(d as CalendarData));
  }, [cursor]);

  const days = useMemo(() => {
    const result: Date[] = [];
    let d = startGrid;
    while (d <= endGrid) {
      result.push(d);
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }
    return result;
  }, [startGrid, endGrid]);

  const byDay = useMemo(() => {
    const map: Record<
      string,
      {
        upcoming: { name: string; amount: number; color: string }[];
        paid: { name: string; amount: number }[];
        paychecks: { amount: number }[];
      }
    > = {};
    const get = (k: string) => (map[k] ||= { upcoming: [], paid: [], paychecks: [] });
    data?.upcoming.forEach((u) =>
      get(u.dueDate).upcoming.push({
        name: u.bill.name,
        amount: u.bill.amount,
        color: u.category?.color ?? '#64748b',
      })
    );
    data?.paid.forEach((p) => get(p.date).paid.push({ name: p.bill_name, amount: p.amount }));
    data?.paychecks.forEach((p) => get(p.date).paychecks.push({ amount: p.amount }));
    return map;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(addMonths(cursor, -1))} className="btn-ghost p-2">
            <ChevronLeft size={18} />
          </button>
          <div className="text-xl font-semibold w-48 text-center">
            {format(cursor, 'MMMM yyyy')}
          </div>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="btn-ghost p-2">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-content-muted">
          <Legend color="#ef4444" label="Due" />
          <Legend color="#10b981" label="Paid" />
          <Legend color="#3b82f6" label="Paycheck" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-surface-3 text-content-muted text-xs uppercase tracking-wide">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-3 py-2 font-medium">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = format(d, 'yyyy-MM-dd');
            const cell = byDay[k];
            const inMonth = isSameMonth(d, cursor);
            return (
              <div
                key={k}
                className={cn(
                  'min-h-[110px] border-r border-b border-border p-2 text-xs',
                  !inMonth && 'bg-surface-3/30 text-content-subtle'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-between mb-1',
                    isToday(d) && 'font-bold'
                  )}
                >
                  <span
                    className={cn(
                      'num',
                      isToday(d) &&
                        'inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-xs dark:text-slate-900'
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                </div>
                <div className="space-y-1">
                  {cell?.paychecks.map((p, i) => (
                    <div
                      key={`pc-${i}`}
                      className="pill bg-info/10 text-info truncate w-full justify-start"
                    >
                      +{fmtMoney(p.amount)}
                    </div>
                  ))}
                  {cell?.paid.map((p, i) => (
                    <div
                      key={`paid-${i}`}
                      className="pill bg-success/10 text-success truncate w-full justify-start"
                      title={`${p.name} · ${fmtMoney(p.amount)}`}
                    >
                      ✓ {p.name}
                    </div>
                  ))}
                  {cell?.upcoming.map((u, i) => (
                    <div
                      key={`u-${i}`}
                      className="pill truncate w-full justify-start"
                      style={{ backgroundColor: `${u.color}22`, color: u.color }}
                      title={`${u.name} · ${fmtMoney(u.amount)}`}
                    >
                      {u.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
