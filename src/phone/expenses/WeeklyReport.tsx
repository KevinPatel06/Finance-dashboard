import { useNavigate, useParams } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import type { WeeklyReport as Report } from '@shared/types';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useApi } from '../data';
import { todayIso } from '../dates';
import { money } from '../format';
import { CircleButton, Group, PCard, Row, SectionTitle } from '../ui/kit';

const shiftWeek = (start: string, n: number) => format(addDays(parseISO(start), 7 * n), 'yyyy-MM-dd');

/** Monday–Sunday recap with the last four weeks and plain-language insights. */
export default function WeeklyReport() {
  const { start } = useParams();
  const navigate = useNavigate();
  const { userName } = useTheme();
  const { data: r } = useApi<Report>(() => window.api.reports.weekly(start), [start]);

  if (!r) return null;
  const max = Math.max(1, ...r.weeks.map((w) => w.total));
  const canGoNext = shiftWeek(r.weekStart, 1) <= format(addDays(parseISO(todayIso()), -7), 'yyyy-MM-dd');
  const name = userName.trim() || 'there';

  const headline =
    r.total === 0
      ? 'No everyday spending logged this week.'
      : r.changePct == null
        ? `You spent ${money(r.total)} this week.`
        : `You spent ${money(r.total)} this week, ${Math.abs(Math.round(r.changePct))}% ${r.changePct >= 0 ? 'more' : 'less'} than last week.`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-2">
        <CircleButton icon={X} label="Close" onClick={() => navigate('/expenses')} />
        <div className="flex gap-2">
          <CircleButton icon={ChevronLeft} label="Previous week" onClick={() => navigate(`/expenses/week/${shiftWeek(r.weekStart, -1)}`)} />
          {canGoNext && (
            <CircleButton icon={ChevronRight} label="Next week" onClick={() => navigate(`/expenses/week/${shiftWeek(r.weekStart, 1)}`)} />
          )}
        </div>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute -right-6 -top-4 w-32 h-32 rounded-full border-[18px] border-brand/30" aria-hidden />
        <h1 className="text-[32px] leading-tight font-display font-bold tracking-tight relative">
          Weekly Expense
          <br />
          Report
        </h1>
        <div className="text-sm text-content-subtle mt-1">
          {format(parseISO(r.weekStart), 'MMM d, yyyy')} – {format(parseISO(r.weekEnd), 'MMM d, yyyy')}
        </div>
      </div>

      <PCard className="p-4 space-y-4">
        <div>
          <div className="text-[15px] font-semibold">Hi {name},</div>
          <div className="text-[17px] font-semibold mt-2 leading-snug">{headline}</div>
        </div>

        <div className="rounded-2xl bg-surface-3/70 p-3">
          <div className="grid grid-cols-3 divide-x divide-border">
            <Stat label="Spent" value={money(r.total)} />
            <Stat
              label="vs last week"
              value={
                r.changePct == null ? (
                  '—'
                ) : (
                  <span className={cn('inline-flex items-center gap-0.5', r.changePct > 0 ? 'text-danger' : 'text-success')}>
                    {r.changePct > 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                    {Math.abs(Math.round(r.changePct))}%
                  </span>
                )
              }
            />
            <Stat label="Daily avg" value={money(r.dailyAverage)} />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3 items-end h-28 px-2">
            {r.weeks.map((w, i) => {
              const isThis = i === r.weeks.length - 1;
              return (
                <div key={w.weekStart} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="text-[10px] text-content-subtle num">{w.total > 0 ? money(w.total) : ''}</div>
                  <div
                    className={cn('w-5 rounded-md', isThis ? 'bg-brand' : 'bg-content-subtle/40')}
                    style={{ height: `${Math.max(6, (w.total / max) * 72)}px` }}
                  />
                  <div className={cn('text-[11px]', isThis ? 'font-semibold' : 'text-content-subtle')}>
                    {isThis ? 'This week' : i === 2 ? 'last week' : `${3 - i}w ago`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-surface-3/70 p-4">
          <div className="flex items-center gap-1.5 text-brand font-semibold text-[15px]">
            <Sparkles size={16} /> Insights
          </div>
          <p className="text-[15px] leading-relaxed mt-1.5">{r.insights.join(' ')}</p>
        </div>
      </PCard>

      {r.byCategory.length > 0 && (
        <>
          <SectionTitle>Top categories</SectionTitle>
          <Group>
            {r.byCategory.map((c) => (
              <Row
                key={String(c.category_id)}
                emoji={c.emoji}
                color={c.color}
                title={c.name}
                subtitle={c.previous > 0 ? `${money(c.previous)} last week` : 'Nothing last week'}
                value={money(c.total)}
              />
            ))}
          </Group>
        </>
      )}
      {r.fundsAdded > 0 && (
        <p className="text-sm text-content-muted text-center">You also added {money(r.fundsAdded)} to your funds. 💪</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-2 first:pl-1">
      <div className="text-xs text-content-subtle">{label}</div>
      <div className="text-[15px] font-semibold num mt-0.5">{value}</div>
    </div>
  );
}
