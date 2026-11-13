import { getDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { monthBounds } from '@shared/paydays';
import { todayIso } from '../dates';
import { moneyCompact } from '../format';
import { EmojiIcon } from '../ui/kit';

export type CalendarMode = 'amount' | 'upcoming';

export interface DayCell {
  total: number;
  upcoming: Array<{ emoji: string | null; amount: number; description: string }>;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * How much a day's spending shades its cell, in the app's green. Fixed steps
 * (not relative to the month's biggest day) so one rent day doesn't wash every
 * other day out, and a colour means the same amount every month.
 */
export const HEAT = [
  { min: 200, cell: 'bg-brand text-white dark:text-slate-950' },
  { min: 60, cell: 'bg-brand/45' },
  { min: 20, cell: 'bg-brand/25' },
  { min: 0.01, cell: 'bg-brand/[0.12]' },
] as const;

const heatFor = (total: number) => HEAT.find((h) => total >= h.min)?.cell;

/**
 * Monday-first month grid. Each day shows its spending as a compact amount
 * ("$1.5k" from $1,000 up, so a cell never overflows) on a green shade that
 * deepens with the amount, or the recurring charges still due. Today's date
 * sits in a dark pill; the picked day gets a ring.
 */
export default function MonthCalendar({
  month,
  days,
  mode,
  selected,
  onPick,
}: {
  month: string;
  days: Map<string, DayCell>;
  mode: CalendarMode;
  selected: string | null;
  onPick: (date: string) => void;
}) {
  const { days: n } = monthBounds(month);
  const lead = (getDay(parseISO(`${month}-01`)) + 6) % 7;
  const today = todayIso();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5" aria-hidden>
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-center text-[13px] font-semibold text-content-muted">
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
          const total = cell?.total ?? 0;
          const upcomingTotal = cell?.upcoming.reduce((s, u) => s + u.amount, 0) ?? 0;
          const heat = mode === 'amount' && !future ? heatFor(total) : undefined;
          return (
            <button
              key={date}
              onClick={() => onPick(date)}
              aria-pressed={selected === date}
              aria-label={`${date}${date === today ? ', today' : ''}${total > 0 ? `, ${moneyCompact(total)} spent` : ''}${
                mode === 'upcoming' && upcomingTotal > 0 ? `, ${moneyCompact(upcomingTotal)} coming up` : ''
              }`}
              className={cn(
                'h-12 rounded-xl px-1 py-1 flex flex-col justify-between text-left press [--dip:0.94]',
                heat ?? (future ? 'border border-border' : 'bg-surface-3/70'),
                selected === date && 'ring-2 ring-content ring-offset-2 ring-offset-surface'
              )}
            >
              <span
                className={cn(
                  'self-start text-[12px] leading-none rounded-full px-1 py-0.5 num',
                  date === today ? 'bg-content text-surface font-semibold' : future ? 'text-content-subtle' : 'opacity-80'
                )}
              >
                {day}
              </span>
              {mode === 'amount' && total > 0 && (
                <span className="text-[12px] leading-none font-semibold num tracking-tight whitespace-nowrap pl-0.5 pb-0.5 self-end">
                  {moneyCompact(total)}
                </span>
              )}
              {mode === 'upcoming' && cell && cell.upcoming.length > 0 && (
                <span className="leading-none self-end pr-0.5 pb-0.5 text-right">
                  <EmojiIcon emoji={cell.upcoming[0].emoji ?? '🔁'} size={13} className="inline-block text-content-muted" />
                  <span className="block text-[11px] font-semibold num text-content-muted mt-0.5">
                    {moneyCompact(upcomingTotal)}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {mode === 'amount' && (
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[13px] text-content-muted" aria-hidden>
          <span>Less</span>
          {[...HEAT].reverse().map((h) => (
            <span key={h.min} className={cn('w-3.5 h-3.5 rounded', h.cell)} />
          ))}
          <span>More</span>
        </div>
      )}
    </div>
  );
}
