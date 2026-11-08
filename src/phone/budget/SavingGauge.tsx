import { useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { BudgetMonthView } from '@shared/types';
import { cn } from '@/lib/utils';
import { monthName } from '../dates';
import { money, moneyWhole } from '../format';
import CountUp from '../ui/CountUp';
import Gauge from '../ui/Gauge';
import Sheet from '../ui/Sheet';
import { savingButton } from './savingCopy';

function Line({ label, value, total, dot }: { label: ReactNode; value: ReactNode; total?: boolean; dot?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-[7px]',
        total ? 'mt-0.5 border-t border-border pt-[9px] font-semibold' : 'text-content-muted'
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        {dot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dot }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="num text-content shrink-0">{value}</span>
    </div>
  );
}

function Heading({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex justify-between gap-2 mt-3 mb-0.5 text-[11.5px] font-bold uppercase tracking-wide text-content-subtle">
      <span>{left}</span>
      <span className="normal-case tracking-normal font-medium">{right}</span>
    </div>
  );
}

const KIND_DOT = { rrsp: '#a5a3e8', tfsa: '#8fd3b5', fhsa: '#efc679' } as const;

/**
 * The Saving tab's gauge (option B, "Put away in <Month>") and its button
 * (option 2, "who's still due"), plus the month's breakdown sheet.
 */
export default function SavingGauge({ view: v }: { view: BudgetMonthView }) {
  const [open, setOpen] = useState(false);
  const s = v.saving;
  const fraction = s.planned > 0 ? Math.min(1, s.putAway / s.planned) : 0;
  const btn = savingButton(v);

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen(true)}
        aria-label={`Put away ${moneyWhole(s.putAway)} of ${moneyWhole(s.planned)}. Show the breakdown`}
        className="press [--dip:0.98] block w-full"
      >
        <Gauge
          fraction={fraction}
          tone="success"
          label={`Put away in ${monthName(v.month)}`}
          value={<CountUp value={s.putAway} format={moneyWhole} />}
          sub={s.planned > 0 ? `of ${moneyWhole(s.planned)} savings plan` : undefined}
        />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="press mx-auto -mt-1 flex max-w-full items-center gap-3 rounded-full bg-surface-2 border border-border/70 shadow-card px-5 py-2.5"
      >
        <span className="text-center leading-tight min-w-0">
          <span className="flex items-center justify-center gap-1 text-[15px] font-semibold num whitespace-nowrap">
            {btn.done && <Check size={15} strokeWidth={2.8} className="text-brand" />}
            {btn.line1}
          </span>
          <span className="block text-xs text-content-subtle truncate">{btn.line2}</span>
        </span>
        <ChevronRight size={18} className="text-content-muted shrink-0" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Saving in ${monthName(v.month)}`}>
        <div className="pb-2 text-[15px]">
          {v.lines.fund.length > 0 && (
            <>
              <Heading left="Funds" right={v.status === 'confirmed' ? 'Added when you confirmed' : 'Added when you confirm'} />
              {v.lines.fund.map((f) => (
                <Line key={f.goal_id} label={f.name} value={money(f.amount)} dot={f.color} />
              ))}
              <Line label="Funds" value={money(v.planned.fund)} total />
            </>
          )}
          {v.lines.contribution.length > 0 && (
            <>
              <Heading left="Contributions" right="Counted once deposited" />
              {v.lines.contribution.map((c) => (
                <Line
                  key={c.account_id}
                  label={c.label}
                  dot={KIND_DOT[c.kind]}
                  value={
                    c.left <= 0 ? (
                      <span className="inline-flex items-center gap-1 text-brand font-semibold">
                        <Check size={14} strokeWidth={2.8} /> {money(c.deposited)}
                      </span>
                    ) : (
                      <span>
                        {c.deposited === 0 && <span className="mr-1.5 text-xs font-semibold text-warning">Due</span>}
                        <span className="font-semibold">{money(c.deposited)}</span>
                        <span className="text-content-muted"> of {money(c.amount)}</span>
                      </span>
                    )
                  }
                />
              ))}
              <Line
                label="Contributions"
                value={
                  <span>
                    {money(v.lines.contribution.reduce((t, c) => t + Math.min(c.deposited, c.amount), 0))}
                    <span className="text-content-muted font-medium"> of {money(v.planned.contribution)}</span>
                  </span>
                }
                total
              />
            </>
          )}
          {s.planned > 0 ? (
            <>
              <div className="mt-2">
                <Line
                  label={<span className="text-base">Put away</span>}
                  value={
                    <span className="text-brand">
                      {money(s.putAway)}
                      <span className="text-content-muted font-medium text-sm"> of {money(s.planned)}</span>
                    </span>
                  }
                  total
                />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-content-subtle">
                All {money(s.planned)} already came off the top of your budget.
                {s.leftToDeposit > 0 && ` The ${money(s.leftToDeposit)} still to deposit is waiting in your bank account.`}
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-sm text-content-muted">
              Nothing is planned for saving this month. Add a fund or a registered account, then give it an amount in
              your plan.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
