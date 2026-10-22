import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Debt, Expense, ExpenseCategory, RecurringExpense, SavingsGoal } from '@shared/types';
import { monthBounds } from '@shared/paydays';
import { occurrencesInRange } from '@shared/recurrence';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { exportCsv } from '@/lib/csv';
import { useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi } from '../data';
import { currentMonth, friendlyDate, monthLabel, monthName, shiftMonth, todayIso } from '../dates';
import { money } from '../format';
import { useQuickAdd } from '../PhoneLayout';
import Sheet from '../ui/Sheet';
import { CircleButton, Group, LargeHeader, PCard, Row, SectionTitle } from '../ui/kit';
import CategoryDonut from './CategoryDonut';
import ExpenseEditor from './ExpenseEditor';
import ExpenseRow from './ExpenseRow';
import MonthCalendar, { type CalendarMode, type DayCell } from './MonthCalendar';

type DayAcc = DayCell & { byCat: Map<number | null, number> };
const blankDay = (): DayAcc => ({ total: 0, emoji: null, upcoming: [], byCat: new Map() });

/** Spending at a glance: month total vs last month, a calendar or a donut, and the ledger. */
export default function ExpensesScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openQuickAdd } = useQuickAdd();
  const [month, setMonth] = useState(currentMonth());
  const [view, setView] = useState<'calendar' | 'categories'>('calendar');
  const [mode, setMode] = useState<CalendarMode>('amount');
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);

  const { data: expenses } = useApi<Expense[]>(() => window.api.expenses.list());
  const { data: cats } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: recurring } = useApi<RecurringExpense[]>(() => window.api.recurringExpenses.list());
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());

  const catById = useMemo(() => new Map((cats ?? []).map((c) => [c.id, c])), [cats]);
  const fundName = new Map((funds ?? []).map((f) => [f.id, f.name]));
  const cardName = new Map((debts ?? []).map((d) => [d.id, d.name]));

  const stats = useMemo(() => {
    if (!expenses) return null;
    const inMonth = expenses.filter((e) => e.date.startsWith(month));
    const total = inMonth.reduce((s, e) => s + e.amount, 0);

    // Compare like with like: for the month in progress, last month up to the same day.
    const prev = shiftMonth(month, -1);
    const isCurrent = month === currentMonth();
    const cutoff = isCurrent ? Number(todayIso().slice(8, 10)) : 31;
    const prevTotal = expenses
      .filter((e) => e.date.startsWith(prev) && Number(e.date.slice(8, 10)) <= cutoff)
      .reduce((s, e) => s + e.amount, 0);

    const days = new Map<string, DayAcc>();
    for (const e of inMonth) {
      const d = days.get(e.date) ?? blankDay();
      d.total += e.amount;
      d.byCat.set(e.category_id, (d.byCat.get(e.category_id) ?? 0) + e.amount);
      days.set(e.date, d);
    }
    for (const d of days.values()) {
      const top = [...d.byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      d.emoji = top && top[0] != null ? catById.get(top[0])?.emoji ?? null : '❔';
    }
    // Recurring charges still to come this month (not yet logged).
    const { start, end } = monthBounds(month);
    const today = todayIso();
    for (const r of recurring ?? []) {
      for (const date of occurrencesInRange(r.anchor_date, r.frequency, r.interval_count, start, end)) {
        if (date <= today) continue;
        const d = days.get(date) ?? blankDay();
        d.upcoming.push({ emoji: r.emoji, amount: r.amount });
        days.set(date, d);
      }
    }

    const byCatMap = new Map<number | null, { total: number; count: number }>();
    for (const e of inMonth) {
      const c = byCatMap.get(e.category_id) ?? { total: 0, count: 0 };
      c.total += e.amount;
      c.count += 1;
      byCatMap.set(e.category_id, c);
    }
    const byCategory = [...byCatMap.entries()]
      .map(([id, v]) => ({ id, ...v, cat: id != null ? catById.get(id) : undefined }))
      .sort((a, b) => b.total - a.total);

    return { inMonth, total, prevTotal, days, byCategory };
  }, [expenses, recurring, month, catById]);

  if (!stats || !cats) return <div className="pt-24 text-center text-content-subtle">Loading…</div>;

  const change = stats.prevTotal > 0 ? ((stats.total - stats.prevTotal) / stats.prevTotal) * 100 : null;
  const lastWeekStart = format(addDays(startOfWeek(parseISO(todayIso()), { weekStartsOn: 1 }), -7), 'yyyy-MM-dd');

  const grouped = new Map<string, Expense[]>();
  for (const e of stats.inMonth) grouped.set(e.date, [...(grouped.get(e.date) ?? []), e]);

  const csv = async () => {
    const path = await exportCsv(
      `expenses-${month}.csv`,
      ['Date', 'Description', 'Category', 'Amount', 'Note'],
      stats.inMonth.map((e) => [
        e.date,
        e.description,
        e.category_id != null ? catById.get(e.category_id)?.name ?? '' : '',
        e.amount.toFixed(2),
        e.note ?? '',
      ])
    );
    if (path) toast.success('Exported.');
  };

  const dayList = day ? stats.inMonth.filter((e) => e.date === day) : [];

  return (
    <div className="space-y-4">
      <LargeHeader
        title="Expenses"
        right={<CircleButton icon={Download} label="Export this month as CSV" onClick={csv} />}
      />

      <div className="flex items-center justify-between">
        <CircleButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
        <button className="text-[17px] font-semibold" onClick={() => setMonth(currentMonth())}>
          {monthLabel(month)}
        </button>
        <CircleButton icon={ChevronRight} label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
      </div>

      <div className="text-center pt-2">
        <div className="text-sm text-content-muted">Total spent</div>
        <div className="text-[44px] leading-tight font-display font-bold num-display">{money(stats.total)}</div>
        {change != null && (
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm">
            <span
              className={cn(
                'w-5 h-5 rounded-full grid place-items-center text-white',
                change <= 0 ? 'bg-success' : 'bg-danger'
              )}
            >
              {change <= 0 ? <ArrowDown size={13} strokeWidth={3} /> : <ArrowUp size={13} strokeWidth={3} />}
            </span>
            <span className="font-semibold">{Math.abs(Math.round(change))}%</span>
            <span className="text-content-muted">vs {monthName(shiftMonth(month, -1))}</span>
          </div>
        )}
      </div>

      <SegmentedControl
        value={view}
        onChange={setView}
        options={[
          { value: 'calendar', label: 'Calendar' },
          { value: 'categories', label: 'Categories' },
        ]}
      />

      {view === 'calendar' ? (
        <>
          <div className="flex justify-end">
            <SegmentedControl
              className="w-[15.5rem]"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'amount', label: 'Amount' },
                { value: 'emoji', label: 'Emoji' },
                { value: 'upcoming', label: 'Upcoming' },
              ]}
            />
          </div>
          <MonthCalendar month={month} days={stats.days} mode={mode} onPick={setDay} />
        </>
      ) : (
        <>
          <CategoryDonut
            total={stats.total}
            slices={stats.byCategory.map((c) => ({
              key: String(c.id),
              emoji: c.cat?.emoji ?? '❔',
              color: c.cat?.color ?? '#94a3b8',
              total: c.total,
            }))}
          />
          <SectionTitle>Categories</SectionTitle>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-content-subtle px-1">Nothing spent this month.</p>
          ) : (
            <Group>
              {stats.byCategory.map((c) => (
                <Row
                  key={String(c.id)}
                  emoji={c.cat?.emoji ?? '❔'}
                  color={c.cat?.color ?? '#94a3b8'}
                  title={c.cat?.name ?? 'Uncategorized'}
                  subtitle={`${c.count} expense${c.count === 1 ? '' : 's'}`}
                  value={money(c.total)}
                  chevron={c.id != null}
                  onClick={c.id != null ? () => navigate(`/category/${c.id}`) : undefined}
                />
              ))}
            </Group>
          )}
        </>
      )}

      <PCard onClick={() => navigate(`/expenses/week/${lastWeekStart}`)} className="px-4 py-3.5 flex items-center gap-3">
        <span className="text-2xl">🗞️</span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold">Your weekly report is ready</div>
          <div className="text-xs text-content-subtle">
            {friendlyDate(lastWeekStart)} – {friendlyDate(format(addDays(parseISO(lastWeekStart), 6), 'yyyy-MM-dd'))}
          </div>
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </PCard>

      {view === 'calendar' && (
        <>
          <SectionTitle>{monthName(month)} expenses</SectionTitle>
          {grouped.size === 0 && <p className="text-sm text-content-subtle px-1">No expenses logged.</p>}
          {[...grouped.entries()].map(([date, list]) => (
            <div key={date}>
              <div className="flex justify-between px-1 mb-1.5 text-xs font-medium text-content-subtle">
                <span>{friendlyDate(date)}</span>
                <span className="num">{money(list.reduce((s, e) => s + e.amount, 0))}</span>
              </div>
              <Group>
                {list.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    category={e.category_id != null ? catById.get(e.category_id) : undefined}
                    fundName={e.fund_id != null ? fundName.get(e.fund_id) : undefined}
                    cardName={e.debt_id != null ? cardName.get(e.debt_id) : undefined}
                    onClick={() => setEditing(e)}
                  />
                ))}
              </Group>
            </div>
          ))}
        </>
      )}

      <Sheet
        open={!!day}
        onClose={() => setDay(null)}
        title={day ? friendlyDate(day) : ''}
        subtitle={day ? money(dayList.reduce((s, e) => s + e.amount, 0)) : undefined}
      >
        {dayList.length === 0 ? (
          <p className="text-center text-sm text-content-subtle py-6">Nothing logged this day.</p>
        ) : (
          <Group>
            {dayList.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                category={e.category_id != null ? catById.get(e.category_id) : undefined}
                onClick={() => {
                  setDay(null);
                  setEditing(e);
                }}
              />
            ))}
          </Group>
        )}
        {day && (
          <button
            className="w-full mt-3 py-3 rounded-full bg-surface-3 text-[15px] font-semibold"
            onClick={() => {
              const d = day;
              setDay(null);
              openQuickAdd({ date: d, manual: true });
            }}
          >
            Log an expense on this day
          </button>
        )}
      </Sheet>

      {editing && <ExpenseEditor expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
