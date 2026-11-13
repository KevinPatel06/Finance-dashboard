import type { ReactNode } from 'react';
import { Check, ChevronRight, Hourglass, Plus } from 'lucide-react';
import type { RegisteredAccount } from '@shared/types';
import { taxYearFor } from '@shared/registered';
import { cn } from '@/lib/utils';
import { monthName, todayIso } from '../dates';
import { pct } from '../format';
import { EmojiAvatar, Bar } from '../ui/kit';
import { cash, KIND_META, overRoom, shortDate } from './meta';

function SmallChip({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'press [--dip:0.94] min-h-11 inline-flex items-center gap-1 rounded-full px-3.5 text-sm font-medium whitespace-nowrap',
        active ? 'bg-content text-surface' : 'bg-surface-3 text-content'
      )}
    >
      {children}
    </button>
  );
}

/**
 * A registered account on the Saving tab (mockup 2, card C): this month's
 * deposit first, then the year's progress and three labelled numbers.
 */
export default function AccountCard({
  account: a,
  onOpen,
  onDeposit,
  onStartYear,
}: {
  account: RegisteredAccount;
  onOpen: () => void;
  onDeposit: () => void;
  /** Waiting accounts: "Enter room" (RRSP) / "Start <year>". */
  onStartYear: () => void;
}) {
  const meta = KIND_META[a.kind];
  const month = todayIso().slice(0, 7);
  const target = a.goal && a.goal > 0 ? a.goal : a.contribution_room;
  const p = pct(a.contributed, target);
  const over = a.waiting ? null : overRoom(a.kind, a.contribution_room, a.contributed);
  const nextYear = taxYearFor(a.kind, a.year_start);

  let panel: ReactNode = null;
  if (a.waiting) {
    panel = (
      <div className="rounded-2xl bg-surface-3 px-3 py-2.5 mt-3">
        <div className="flex gap-2 items-start text-[13px] text-content-muted">
          <Hourglass size={16} className="shrink-0 mt-px" />
          <span>
            {a.kind === 'rrsp'
              ? `Enter your ${nextYear} room from your Notice of Assessment to start budgeting.`
              : `Your ${nextYear} year is ready to start.`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2.5">
          <span className="text-[13px] num">
            <span className="font-semibold">{cash(a.contributed)}</span>
            <span className="text-content-muted"> in since {shortDate(a.year_start).replace(/, \d{4}$/, '')}</span>
          </span>
          <span className="flex gap-1.5">
            <SmallChip onClick={onDeposit}>Log deposit</SmallChip>
            <SmallChip active onClick={onStartYear}>
              {a.kind === 'rrsp' ? 'Enter room' : `Start ${nextYear}`}
            </SmallChip>
          </span>
        </div>
      </div>
    );
  }
  // A deposit still due this month is on the Saving tab's "To deposit" list,
  // which has its own Log button; otherwise the card offers one.
  const plannedNow = a.this_month?.planned ?? 0;
  const depositedNow = a.this_month?.deposited ?? 0;
  const dueNow = !a.waiting && plannedNow > 0 && depositedNow < plannedNow;
  const monthDone = !a.waiting && plannedNow > 0 && depositedNow >= plannedNow;
  const goalMet = a.goal != null && a.goal > 0 && a.contributed >= a.goal;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="block w-full text-left rounded-[22px] bg-surface-2 border border-border/70 shadow-card px-4 pt-3.5 pb-3 press [--dip:0.98] cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <EmojiAvatar emoji={meta.emoji} color={meta.color} />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold truncate">{a.label || meta.label}</div>
          <div className="text-xs text-content-subtle truncate">
            {a.waiting ? `${nextYear} · waiting to start` : `${a.tax_year} · by ${shortDate(a.goal_deadline)}`}
          </div>
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </div>

      {panel}

      {!a.waiting && (
        <>
          <div className="mt-3">
            <Bar pct={p} color={meta.color} label={`${Math.floor(p)}% of the goal`} />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 text-sm text-content-muted num">
            <span>
              <span className="font-semibold text-content">{cash(a.contributed)}</span>
              {a.goal != null && a.goal > 0 ? ` of ${cash(a.goal)} goal` : ' contributed'}
            </span>
            <span className="text-right">{cash(Math.max(0, a.remaining))} room left</span>
          </div>
          {over && <div className="mt-2 text-[13px] font-medium text-warning-ink">{over}</div>}
          {!dueNow && (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[13px] text-content-muted inline-flex items-center gap-1.5 min-w-0">
                {(monthDone || goalMet) && <Check size={15} strokeWidth={2.6} className="text-brand-ink shrink-0" />}
                <span className="truncate">
                  {goalMet
                    ? 'Goal met for this year'
                    : monthDone
                      ? `${cash(depositedNow)} deposited · ${monthName(month)} done`
                      : a.this_month
                        ? 'Nothing planned this month'
                        : ''}
                </span>
              </span>
              <SmallChip onClick={onDeposit}>
                <Plus size={12} strokeWidth={2.4} /> Log deposit
              </SmallChip>
            </div>
          )}
        </>
      )}
    </div>
  );
}
