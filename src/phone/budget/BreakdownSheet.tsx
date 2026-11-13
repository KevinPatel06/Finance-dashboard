import type { BudgetMonthView } from '@shared/types';
import { cn } from '@/lib/utils';
import { monthName } from '../dates';
import { money, moneyWhole } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton } from '../ui/kit';
import { PLAN_COLOR, type PlanColorKey } from './planColors';

/** One bar of the "where it goes" list, scaled against the biggest number shown. */
function BarRow({
  label,
  amount,
  scale,
  color,
  strong,
}: {
  label: string;
  amount: number;
  scale: number;
  color: string;
  strong?: boolean;
}) {
  const w = scale > 0 ? Math.max(2, Math.min(100, (amount / scale) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 h-[34px]">
      <span className={cn('w-[7.25rem] shrink-0 text-[15px] truncate', strong && 'font-semibold')}>{label}</span>
      <div className="flex-1 h-3.5 rounded bg-surface-3" aria-hidden>
        <div className="h-3.5 rounded" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className={cn('w-[4.75rem] shrink-0 text-right text-[15px] num', strong && 'font-semibold')}>
        {moneyWhole(amount)}
      </span>
    </div>
  );
}

const LABEL: Record<PlanColorKey, string> = {
  recurring: 'Recurring',
  debt: 'Debt payments',
  fund: 'Savings funds',
  contribution: 'Contributions',
  spend: 'Spending plan',
};

/**
 * "How we got $300": the month's income, then everything planned against it
 * biggest first, then the spending plan down to what's left. Sorting keeps
 * the bars in a tidy descending line, so the eye reads it top to bottom.
 */
export default function BreakdownSheet({
  view: v,
  open,
  onClose,
  onFix,
}: {
  view: BudgetMonthView;
  open: boolean;
  onClose: () => void;
  onFix: () => void;
}) {
  const planned: Array<{ key: PlanColorKey; amount: number }> = (
    [
      { key: 'recurring', amount: v.recurring.total },
      { key: 'debt', amount: v.planned.debt },
      { key: 'fund', amount: v.planned.fund },
      { key: 'contribution', amount: v.planned.contribution },
      { key: 'spend', amount: v.planned.spend },
    ] as Array<{ key: PlanColorKey; amount: number }>
  )
    .filter((p) => p.amount > 0.004)
    .sort((a, b) => b.amount - a.amount);
  const total = planned.reduce((s, p) => s + p.amount, 0);
  const scale = Math.max(v.income, ...planned.map((p) => p.amount));
  const unassigned = Math.round(v.leftToAllocate * 100) / 100;
  const over = v.leftToSpend < 0;
  const spentPct = v.planned.spend > 0 ? Math.min(100, (v.spent.total / v.planned.spend) * 100) : 100;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={over ? `Why you're over by ${money(-v.leftToSpend)}` : `How we got ${money(v.leftToSpend)}`}
    >
      <div className="space-y-3 pb-2">
        <div className="rounded-[22px] bg-surface-2 border border-border/70 px-3.5 pt-3 pb-2.5">
          <h3 className="text-base font-semibold mb-1">Where {monthName(v.month)}'s money goes</h3>
          <BarRow label="Income" amount={v.income} scale={scale} color="rgb(var(--brand))" strong />
          {planned.length > 0 && (
            <div className="text-[13px] text-content-subtle mt-1.5 mb-0.5">Planned, biggest first</div>
          )}
          {planned.map((p) => (
            <BarRow key={p.key} label={LABEL[p.key]} amount={p.amount} scale={scale} color={PLAN_COLOR[p.key]} />
          ))}
          <div className="mt-1.5 pt-2 border-t border-border flex justify-between text-[15px] font-semibold num">
            <span>Planned in total</span>
            <span>{moneyWhole(total)}</span>
          </div>
          {Math.abs(unassigned) >= 0.01 && (
            <div
              className={cn(
                'mt-1 flex justify-between text-[15px] num',
                unassigned < 0 ? 'text-danger font-semibold' : 'text-content-muted'
              )}
            >
              <span>{unassigned < 0 ? 'More than income by' : 'Not assigned yet'}</span>
              <span>{moneyWhole(Math.abs(unassigned))}</span>
            </div>
          )}
        </div>

        <div className="rounded-[22px] bg-surface-2 border border-border/70 p-3.5 space-y-2.5">
          <h3 className="text-base font-semibold">Your spending plan</h3>
          <div
            className="flex h-3.5 rounded-full overflow-hidden bg-surface-3"
            role="img"
            aria-label={`${money(v.spent.total)} spent of ${money(v.planned.spend)}`}
          >
            {over ? (
              <div className="w-full bg-danger/55" />
            ) : (
              <>
                <div style={{ width: `${spentPct}%`, backgroundColor: PLAN_COLOR.spend }} />
                <div className="flex-1 bg-brand" />
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Plan', money(v.planned.spend), ''],
              ['Spent', money(v.spent.total), ''],
              [over ? 'Over by' : 'Left', money(Math.abs(v.leftToSpend)), over ? 'text-danger' : 'text-brand-ink'],
            ].map(([k, val, tone]) => (
              <div key={k}>
                <div className="text-[13px] text-content-subtle">{k}</div>
                <div className={cn('text-[17px] font-semibold num', tone)}>{val}</div>
              </div>
            ))}
          </div>
          {v.daysLeft > 0 && v.leftToSpend > 0 && (
            <p className="text-sm text-content-muted">
              That's {money(v.safePerDay)} a day for the {v.daysLeft} day{v.daysLeft === 1 ? '' : 's'} left.
            </p>
          )}
        </div>

        <p className="text-[13px] leading-relaxed text-content-subtle px-1">
          Recurring charges, purchases paid from a fund, and RRSP/TFSA/FHSA contributions don't count as spending here.
          They're already planned above.
        </p>

        {unassigned < -0.004 && (
          <BigButton
            onClick={() => {
              onClose();
              onFix();
            }}
          >
            Fix the plan
          </BigButton>
        )}
      </div>
    </Sheet>
  );
}
