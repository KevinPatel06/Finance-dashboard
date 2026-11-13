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
import { money, moneyWhole } from '../format';
import { useQuickAdd } from '../PhoneLayout';
import { CircleButton, EmojiIcon, Group, LargeHeader, PCard, Row, SectionTitle } from '../ui/kit';
import CategoryDonut from './CategoryDonut';
import ExpenseEditor from './ExpenseEditor';
import ExpenseRow from './ExpenseRow';
import MonthCalendar, { type CalendarMode, type DayCell } from './MonthCalendar';

const blankDay = (): DayCell => ({ total: 0, upcoming: [] });

/** Spending at a glance: month total vs last month, a calendar or a donut, and the ledger. */
export default function ExpensesScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  const { openQuickAdd } = useQuickAdd();
  const [month, setMonthState] = useState(currentMonth());
  const [view, setView] = useState<'calendar' | 'categories' | 'upcoming'>('calendar');
  const [day, setDay] = useState<string | null>(todayIso());
  const mode: CalendarMode = view === 'upcoming' ? 'upcoming' : 'amount';
  const setMonth = (m: string) => {
    setMonthState(m);
    // Keep a day picked only when it's in the month on screen: today, if it is.
    setDay(m === currentMonth() ? todayIso() : null);
  };
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

    const days = new Map<string, DayCell>();
    for (const e of inMonth) {
      const d = days.get(e.date) ?? blankDay();
      d.total += e.amount;
      days.set(e.date, d);
    }
    // Recurring charges still to come this month (not yet logged).
    const { start, end } = monthBounds(month);
    const today = todayIso();
    for (const r of recurring ?? []) {
      for (const date of occurrencesInRange(r.anchor_date, r.frequency, r.interval_count, start, end)) {
        if (date <= today) continue;
        const d = days.get(date) ?? blankDay();
        d.upcoming.push({ emoji: r.emoji, amount: r.amount, description: r.description });
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
  // A day's average so far: the current month counts the days up to today.
  const daysSoFar =
    month === currentMonth() ? Number(todayIso().slice(8, 10)) : month < currentMonth() ? monthBounds(month).days : 0;
  const perDay = daysSoFar > 0 ? stats.total / daysSoFar : null;
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

      <div className="flex items-center justify-between gap-2">
        <CircleButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
        <div className="min-w-0 text-center">
          <div className="text-[44px] leading-tight font-display font-bold num-display">{money(stats.total)}</div>
          <button
            className="text-sm text-content-muted"
            onClick={() => setMonth(currentMonth())}
            aria-label={`${monthLabel(month)}. Go to this month`}
          >
            spent in {month === currentMonth() ? monthName(month) : monthLabel(month)}
            {perDay != null && <span className="num"> · {moneyWhole(perDay)} a day</span>}
          </button>
        </div>
        <CircleButton icon={ChevronRight} label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
      </div>

      <div className="text-center -mt-2">
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
          { value: 'upcoming', label: 'Upcoming' },
        ]}
      />

      {view !== 'categories' ? (
        <>
          <MonthCalendar month={month} days={stats.days} mode={mode} selected={day} onPick={setDay} />
          {day && day.startsWith(month) && (
            <DayCard
              date={day}
              expenses={dayList}
              upcoming={mode === 'upcoming' ? stats.days.get(day)?.upcoming ?? [] : []}
              catById={catById}
              fundName={fundName}
              cardName={cardName}
              onEdit={setEditing}
              onAdd={() => openQuickAdd({ date: day, manual: true })}
            />
          )}
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
        <EmojiIcon emoji="🗞️" size={24} strokeWidth={1.8} className="text-brand" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold">Your weekly report is ready</div>
          <div className="text-xs text-content-subtle">
            {friendlyDate(lastWeekStart)} – {friendlyDate(format(addDays(parseISO(lastWeekStart), 6), 'yyyy-MM-dd'))}
          </div>
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </PCard>

      {view !== 'categories' && (
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

      {editing && <ExpenseEditor expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The picked calendar day, right under the calendar: what was spent (with notes) and what's still coming. */
function DayCard({
  date,
  expenses,
  upcoming,
  catById,
  fundName,
  cardName,
  onEdit,
  onAdd,
}: {
  date: string;
  expenses: Expense[];
  upcoming: DayCell['upcoming'];
  catById: Map<number, ExpenseCategory>;
  fundName: Map<number, string>;
  cardName: Map<number, string>;
  onEdit: (e: Expense) => void;
  onAdd: () => void;
}) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <section aria-label={`Expenses on ${friendlyDate(date)}`} className="rounded-[22px] bg-surface-2 border border-border/70 shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/70">
        <span className="text-base font-semibold">{format(parseISO(date), 'EEE, MMM d')}</span>
        <span className="text-base font-semibold num">{money(total)}</span>
      </div>
      <div className="divide-y divide-border/70">
        {expenses.map((e) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            hideDate
            category={e.category_id != null ? catById.get(e.category_id) : undefined}
            fundName={e.fund_id != null ? fundName.get(e.fund_id) : undefined}
            cardName={e.debt_id != null ? cardName.get(e.debt_id) : undefined}
            onClick={() => onEdit(e)}
          />
        ))}
        {upcoming.map((u, i) => (
          <Row
            key={`u${i}`}
            emoji={u.emoji ?? '🔁'}
            color="#64748b"
            title={u.description}
            subtitle="Recurring · coming up"
            value={money(u.amount)}
            valueTone="muted"
          />
        ))}
        {expenses.length === 0 && upcoming.length === 0 && (
          <p className="px-4 py-3 text-sm text-content-muted">Nothing logged this day.</p>
        )}
      </div>
      <button onClick={onAdd} className="w-full h-12 border-t border-border/70 text-[15px] font-semibold text-brand-ink">
        Log an expense on this day
      </button>
    </section>
  );
}
