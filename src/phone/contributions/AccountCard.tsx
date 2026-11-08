import type { ReactNode } from 'react';
import { Check, ChevronRight, Hourglass, Plus } from 'lucide-react';
import type { RegisteredAccount } from '@shared/types';
import { taxYearFor } from '@shared/registered';
import { cn } from '@/lib/utils';
import { monthName, todayIso } from '../dates';
import { pct } from '../format';
import { EmojiAvatar, HatchedBar } from '../ui/kit';
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
        'press [--dip:0.94] inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
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
  } else if (a.this_month) {
    const { planned, deposited } = a.this_month;
    if (planned <= 0) {
      const met = a.goal != null && a.contributed >= a.goal;
      panel = (
        <div className={cn('rounded-2xl px-3 py-2.5 mt-3 flex items-center justify-between gap-2', met ? 'bg-brand-soft' : 'bg-surface-3')}>
          <span className="text-[13px] text-content-muted flex items-center gap-1.5">
            {met && <Check size={15} strokeWidth={2.6} className="text-brand" />}
            {met ? 'Goal met for this year' : 'Nothing planned this month'}
          </span>
          <SmallChip onClick={onDeposit}>
            <Plus size={12} strokeWidth={2.4} /> Log deposit
          </SmallChip>
        </div>
      );
    } else if (deposited >= planned) {
      panel = (
        <div className="rounded-2xl bg-brand-soft px-3 py-2.5 mt-3 flex items-center gap-2 text-[14px]">
          <Check size={16} strokeWidth={2.6} className="text-brand shrink-0" />
          <span className="num">
            <span className="font-semibold">{cash(deposited)}</span>
            <span className="text-content-muted"> deposited · {monthName(month)} done</span>
          </span>
        </div>
      );
    } else {
      const due = deposited === 0;
      panel = (
        <div className={cn('rounded-2xl px-3 py-2.5 mt-3', due ? 'bg-warning/15' : 'bg-surface-3')}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className={cn('text-xs', due ? 'text-warning font-semibold' : 'text-content-muted')}>
                {due ? 'Deposit due' : monthName(month)}
              </div>
              <div className="text-[14px] num">
                <span className="font-semibold">{cash(deposited)}</span>
                <span className="text-content-muted"> of {cash(planned)} deposited</span>
              </div>
            </div>
            <SmallChip active onClick={onDeposit}>
              <Plus size={12} strokeWidth={2.4} /> Log deposit
            </SmallChip>
          </div>
          {!due && (
            <div className="mt-2">
              <HatchedBar pct={pct(deposited, planned)} color={meta.color} height="sm" />
            </div>
          )}
        </div>
      );
    }
  }

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
            <HatchedBar pct={p} color={meta.color} badge={`${Math.floor(p)}%`} />
          </div>
          <div className="grid grid-cols-3 mt-3 pt-2.5 border-t border-border/70 divide-x divide-border/70">
            {[
              ['Contributed', cash(a.contributed)],
              ['Goal', a.goal != null && a.goal > 0 ? cash(a.goal) : '—'],
              ['Room left', cash(Math.max(0, a.remaining))],
            ].map(([k, v], i) => (
              <div key={k} className={cn('min-w-0', i === 0 ? 'pr-2' : 'px-2')}>
                <div className="text-[11px] text-content-subtle">{k}</div>
                <div className="text-[15px] font-semibold num truncate">{v}</div>
              </div>
            ))}
          </div>
          {over && <div className="mt-2 text-xs font-medium text-warning">{over}</div>}
          {!a.this_month && (
            <div className="mt-2.5">
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
