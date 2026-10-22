import { getDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { monthBounds } from '@shared/paydays';
import { todayIso } from '../dates';
import { moneyCompact } from '../format';

export type CalendarMode = 'amount' | 'emoji' | 'upcoming';

export interface DayCell {
  total: number;
  emoji: string | null; // the day's biggest category
  upcoming: Array<{ emoji: string | null; amount: number }>;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Monday-first month grid. Each day shows its spending as a compact amount,
 * as the emoji of its biggest category, or the recurring charges still due.
 */
export default function MonthCalendar({
  month,
  days,
  mode,
  onPick,
}: {
  month: string;
  days: Map<string, DayCell>;
  mode: CalendarMode;
  onPick: (date: string) => void;
}) {
  const { days: n } = monthBounds(month);
  const lead = (getDay(parseISO(`${month}-01`)) + 6) % 7;
  const today = todayIso();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-content-subtle">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const date = `${month}-${String(day).padStart(2, '0')}`;
          const cell = days.get(date);
          const future = date > today;
          const upcomingTotal = cell?.upcoming.reduce((s, u) => s + u.amount, 0) ?? 0;
          return (
            <button
              key={date}
              onClick={() => onPick(date)}
              className={cn(
                'aspect-[4/5] rounded-xl border p-1.5 flex flex-col justify-between text-left transition active:scale-95',
                date === today ? 'border-brand bg-brand-soft/40' : 'border-border/70 bg-surface-2',
                future && mode !== 'upcoming' && 'opacity-55'
              )}
            >
              <span className="text-[11px] leading-none text-content-subtle">{day}</span>
              {mode === 'amount' && cell && cell.total > 0 && (
                <span className="text-[13px] leading-none font-semibold num truncate">{moneyCompact(cell.total)}</span>
              )}
              {mode === 'emoji' && cell && cell.total > 0 && (
                <span className="text-xl leading-none self-center pb-0.5">{cell.emoji ?? '❔'}</span>
              )}
              {mode === 'upcoming' && cell && cell.upcoming.length > 0 && (
                <span className="leading-none">
                  <span className="block text-sm">{cell.upcoming[0].emoji ?? '🔁'}</span>
                  <span className="block text-[11px] font-semibold num text-content-muted mt-0.5">
                    {moneyCompact(upcomingTotal)}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
