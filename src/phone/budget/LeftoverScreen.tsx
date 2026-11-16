import { useState } from 'react';
import type { LeftoverMonth, LeftoverYear } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/utils';
import { useApi, useRefresh } from '../data';
import { monthName } from '../dates';
import { money, moneyWhole } from '../format';
import CountUp from '../ui/CountUp';
import { Group, NavHeader, PCard, Row, SectionTitle, StatTrio } from '../ui/kit';
import LeftoverSheet from './LeftoverSheet';

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function subtitle(m: LeftoverMonth): string {
  switch (m.status) {
    case 'saved':
      return m.saved < m.amount ? `${money(m.saved)} put in ${m.fund!.name}` : `Put in ${m.fund!.name}`;
    case 'kept':
      return m.amount >= 1 ? 'Left in the bank' : 'Spent it all';
    case 'pending':
      return 'Not decided yet';
    case 'over':
      return 'Spent more than planned';
  }
}

/** Twelve bars, one per month: green for money left over, red below the line for overspending. */
function YearBars({ data }: { data: LeftoverYear }) {
  const byMonth = new Map(data.months.map((m) => [Number(m.month.slice(5, 7)) - 1, m.amount]));
  const peak = Math.max(1, ...[...byMonth.values()].map(Math.abs));
  const anyOver = [...byMonth.values()].some((a) => a < 0);
  return (
    <div className="mt-4" aria-hidden>
      <div className="grid grid-cols-12 gap-1.5 items-end h-20">
        {MONTH_INITIALS.map((_, i) => {
          const a = byMonth.get(i);
          return (
            <div key={i} className="h-full flex items-end">
              {a != null && a > 0 ? (
                <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(6, (a / peak) * 100)}%` }} />
              ) : (
                <div className={cn('w-full h-[3px] rounded-full', a != null ? 'bg-content-subtle/40' : 'bg-border/60')} />
              )}
            </div>
          );
        })}
      </div>
      {anyOver && (
        <div className="grid grid-cols-12 gap-1.5 items-start h-8 border-t border-border/70">
          {MONTH_INITIALS.map((_, i) => {
            const a = byMonth.get(i);
            return (
              <div key={i} className="h-full">
                {a != null && a < 0 && (
                  <div className="w-full rounded-b-md bg-danger/80" style={{ height: `${Math.max(10, (-a / peak) * 100)}%` }} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-12 gap-1.5 mt-1.5 text-[11px] text-content-subtle text-center">
        {MONTH_INITIALS.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * What you didn't spend each month this year, and where it went. Months never
 * roll over, so this is the only place last months' leftovers add up.
 */
export default function LeftoverScreen() {
  const { bump } = useRefresh();
  const [year, setYear] = useState<number | undefined>(undefined);
  const { data } = useApi<LeftoverYear>(() => window.api.budget.leftoverYear(year), [year]);
  const [deciding, setDeciding] = useState<LeftoverMonth | null>(null);

  if (!data) return null;
  const finished = data.months.length;

  return (
    <div className="space-y-4">
      <NavHeader title="Leftovers" subtitle={`${data.year}`} />

      {data.years.length > 1 && (
        <SegmentedControl
          value={String(data.year)}
          onChange={(v) => setYear(Number(v))}
          options={data.years.slice(0, 4).map((y) => ({ value: String(y), label: String(y) }))}
        />
      )}

      <PCard className="px-4 pt-4 pb-3.5">
        <div className="text-sm text-content-muted">Left over in {data.year}</div>
        <div className="text-[34px] leading-tight font-display font-bold num">
          <CountUp value={data.total} format={moneyWhole} />
        </div>
        <div className="text-sm text-content-subtle">
          {finished === 0
            ? 'No finished months yet'
            : `across ${finished} finished month${finished === 1 ? '' : 's'}`}
          {data.pending > 0 && ` · ${money(data.pending)} not decided`}
        </div>
        {finished > 0 && <YearBars data={data} />}
        <div className="mt-4 pt-3 border-t border-border/70">
          <StatTrio
            items={[
              { label: 'Into funds', value: moneyWhole(data.saved) },
              { label: 'In the bank', value: moneyWhole(data.kept) },
              {
                label: 'Overspent',
                value: <span className={data.overspent > 0 ? 'text-danger' : undefined}>{moneyWhole(data.overspent)}</span>,
              },
            ]}
          />
        </div>
      </PCard>

      {finished === 0 ? (
        <p className="text-sm text-content-subtle text-center py-6 px-6">
          When a month you've confirmed ends, whatever you didn't spend shows up here.
        </p>
      ) : (
        <>
          <SectionTitle>By month</SectionTitle>
          <Group>
            {data.months.map((m) => (
              <Row
                key={m.month}
                emoji={m.status === 'saved' ? m.fund!.emoji : m.status === 'over' ? '💸' : '🪙'}
                color={m.status === 'saved' ? m.fund!.color : m.status === 'over' ? '#ef4444' : '#14b8a6'}
                title={monthName(m.month)}
                subtitle={subtitle(m)}
                value={m.amount < 0 ? `−${money(-m.amount)}` : money(m.amount)}
                valueTone={m.amount < 0 ? 'danger' : m.status === 'saved' ? 'success' : 'default'}
                chevron={m.status === 'pending'}
                onClick={m.status === 'pending' ? () => setDeciding(m) : undefined}
              />
            ))}
          </Group>
          <p className="text-xs text-content-subtle text-center px-6">
            Overspent months don't come off the total. Each month starts fresh from its own paychecks.
          </p>
        </>
      )}

      {deciding && (
        <LeftoverSheet
          month={deciding.month}
          amount={deciding.amount}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            bump();
          }}
        />
      )}
    </div>
  );
}
