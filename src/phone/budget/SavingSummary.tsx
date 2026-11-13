import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { BudgetMonthView } from '@shared/types';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { monthName } from '../dates';
import { money, moneyWhole } from '../format';
import CountUp from '../ui/CountUp';
import Sheet from '../ui/Sheet';
import { PCard } from '../ui/kit';
import { fillTint } from '../ui/pastel';
import { KIND_META } from '../contributions/meta';
import { PLAN_COLOR } from './planColors';
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

/**
 * The Saving tab's hero: what's been put away this month as one number, with
 * a bar split by where it went (funds, then each account) and what's still to
 * go. Tapping it opens the month's saving breakdown.
 */
export default function SavingSummary({ view: v }: { view: BudgetMonthView }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const s = v.saving;
  const confirmed = v.status === 'confirmed';
  const fundsIn = confirmed ? v.planned.fund : 0;
  const parts = [
    ...(fundsIn > 0 ? [{ key: 'funds', label: 'Funds', amount: fundsIn, color: PLAN_COLOR.fund }] : []),
    ...v.lines.contribution
      .filter((c) => c.deposited > 0)
      .map((c) => ({
        key: `c${c.account_id}`,
        label: c.label,
        amount: c.deposited,
        color: fillTint(KIND_META[c.kind].color, theme),
      })),
  ];
  const toGo = Math.max(0, s.planned - s.putAway);
  const scale = Math.max(s.planned, s.putAway);
  const showSplit = confirmed && s.planned > 0;
  const btn = savingButton(v);

  return (
    <>
      <PCard
        onClick={() => setOpen(true)}
        className="px-[18px] pt-4 pb-3.5"
      >
        <span className="sr-only">Show the saving breakdown. </span>
        <div className="text-[15px] text-content-muted">Put away in {monthName(v.month)}</div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[42px] leading-none font-display font-bold num-display">
            <CountUp value={s.putAway} format={moneyWhole} />
          </span>
          {s.planned > 0 && <span className="text-[17px] text-content-muted num">of {moneyWhole(s.planned)}</span>}
        </div>

        {showSplit ? (
          <>
            <div
              className="mt-3.5 flex gap-0.5 h-4 rounded-full overflow-hidden bg-surface-3"
              role="img"
              aria-label={`${parts.map((p) => `${p.label} ${moneyWhole(p.amount)}`).join(', ') || 'Nothing yet'}${toGo > 0 ? `, ${moneyWhole(toGo)} to go` : ''}`}
            >
              {parts.map((p) => (
                <div key={p.key} style={{ width: `${(p.amount / scale) * 100}%`, backgroundColor: p.color }} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-content-muted" aria-hidden>
              {parts.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label} <span className="num">{moneyWhole(p.amount)}</span>
                </span>
              ))}
              {toGo > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-content-subtle" />
                  To go <span className="num">{moneyWhole(toGo)}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-brand-ink font-medium">
                  <Check size={15} strokeWidth={2.8} /> All put away
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 text-sm text-content-muted">
            {btn.line1} · {btn.line2}
          </div>
        )}
      </PCard>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Saving in ${monthName(v.month)}`}>
        <div className="pb-2 text-[15px]">
          {v.lines.fund.length > 0 && (
            <>
              <Heading left="Funds" right={confirmed ? 'Added when you confirmed' : 'Added when you confirm'} />
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
                  dot={fillTint(KIND_META[c.kind].color, theme)}
                  value={
                    c.left <= 0 ? (
                      <span className="inline-flex items-center gap-1 text-brand-ink font-semibold">
                        <Check size={14} strokeWidth={2.8} /> {money(c.deposited)}
                      </span>
                    ) : (
                      <span>
                        {c.deposited === 0 && <span className="mr-1.5 text-xs font-semibold text-warning-ink">Due</span>}
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
                    <span className="text-brand-ink">
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
    </>
  );
}
