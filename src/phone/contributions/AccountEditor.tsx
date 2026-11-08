import { useState } from 'react';
import { Check } from 'lucide-react';
import type { RegisteredAccount, RegisteredKind } from '@shared/types';
import { FHSA_LIFETIME, splitPreview, taxYearFor, tfsaLimit, yearBounds } from '@shared/registered';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useMonth, useRefresh } from '../data';
import { shiftMonth, todayIso } from '../dates';
import Sheet from '../ui/Sheet';
import { BigButton, EmojiAvatar, MoneyInput, parseMoney } from '../ui/kit';
import { cash, KIND_META, monthShort, shortDate } from './meta';

type Mode = 'add' | 'edit' | 'newYear';

const ROOM_HINT: Record<RegisteredKind, string> = {
  rrsp: 'Your “RRSP deduction limit” on your Notice of Assessment or CRA My Account.',
  tfsa: 'Your TFSA room on CRA My Account.',
  fhsa: 'Your FHSA participation room on CRA My Account.',
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn('relative w-11 h-6 rounded-full transition shrink-0', on ? 'bg-brand' : 'bg-surface-3 border border-border')}
    >
      <span
        className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-transform', on && 'translate-x-5')}
      />
    </button>
  );
}

/**
 * Add a registered account, edit the current year, or start a new year
 * (mockup 1 screens 6–7). The deadline is when the GOAL is due; it can be
 * earlier than the CRA year's end but never later.
 */
export default function AccountEditor({
  mode,
  account,
  kinds,
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: Mode;
  account?: RegisteredAccount;
  /** Add mode: the kinds not added yet. */
  kinds?: RegisteredKind[];
  onClose: () => void;
  onSaved: (a: RegisteredAccount) => void;
  onDeleted?: () => void;
}) {
  const { bump } = useRefresh();
  const confirm = useConfirm();
  const { data: monthView } = useMonth();
  const today = todayIso();
  const sug = mode === 'newYear' ? account?.suggestion ?? null : null;

  const [kind, setKind] = useState<RegisteredKind>(account?.kind ?? kinds?.[0] ?? 'tfsa');
  const year =
    mode === 'add' ? taxYearFor(kind, today) : mode === 'newYear' ? sug?.tax_year ?? taxYearFor(kind, today) : account!.tax_year;
  const bounds = yearBounds(kind, year);

  const initialRoom =
    mode === 'edit' ? account!.contribution_room : mode === 'newYear' ? sug?.room ?? null : null;
  const initialGoal = mode === 'edit' ? account!.goal : mode === 'newYear' ? sug?.goal ?? null : null;
  const [room, setRoom] = useState(initialRoom != null ? String(initialRoom) : '');
  const [already, setAlready] = useState('');
  const [goal, setGoal] = useState(initialGoal != null ? String(initialGoal) : '');
  const [deadline, setDeadline] = useState(
    mode === 'edit' ? account!.goal_deadline : mode === 'newYear' ? sug?.goal_deadline ?? bounds.end : ''
  );
  const [budgeted, setBudgeted] = useState(
    mode === 'edit' ? !!account!.budgeted : mode === 'newYear' ? sug?.budgeted ?? true : true
  );
  const [lifetimeMax, setLifetimeMax] = useState(!!account?.fhsa_lifetime_max);
  const [busy, setBusy] = useState(false);

  const meta = KIND_META[kind];
  const effDeadline = deadline && deadline <= bounds.end ? deadline : bounds.end;
  const roomValue = parseMoney(room);
  const goalValue = goal === '' ? null : parseMoney(goal);

  // What's already in this year, for the live "$X a month" preview. A
  // confirmed month's plan is fixed, so budgeting then starts next month.
  const month = today.slice(0, 7);
  const { perMonth, from, months: n } = splitPreview({
    goal: goalValue ?? 0,
    deposits:
      mode === 'add'
        ? [{ date: bounds.start, amount: parseMoney(already) }]
        : (account?.contributions ?? []).map((c) => ({ date: c.date, amount: c.amount })),
    yearStart: bounds.start,
    currentMonth: month,
    currentConfirmed: monthView?.status === 'confirmed',
    deadline: effDeadline,
  });
  const preview = !budgeted
    ? 'Track room and deposits only'
    : !goalValue
      ? 'Set a goal to split it by month'
      : n === 0
        ? 'The deadline has passed'
        : perMonth === 0
          ? 'Goal already reached'
          : `${cash(perMonth)} a month · ${monthShort(from)} – ${monthShort(shiftMonth(from, n - 1))} (${n} month${n === 1 ? '' : 's'})`;

  const overGoal = goalValue != null && room !== '' && goalValue > roomValue;
  const valid = room !== '' && roomValue >= 0 && (!budgeted || (goalValue ?? 0) > 0);

  const save = async () => {
    setBusy(true);
    try {
      const fields = {
        contribution_room: roomValue,
        goal: goalValue,
        goal_deadline: effDeadline,
        budgeted,
        fhsa_lifetime_max: kind === 'fhsa' ? lifetimeMax : undefined,
      };
      const saved = (
        mode === 'add'
          ? await window.api.registered.create({
              kind,
              label: meta.label,
              ...fields,
              already_contributed: parseMoney(already) || undefined,
            })
          : mode === 'edit'
            ? await window.api.registered.update(account!.id, fields)
            : await window.api.registered.startYear(account!.id, fields)
      ) as RegisteredAccount;
      bump();
      onSaved(saved);
    } finally {
      setBusy(false);
    }
  };

  const notNow = async () => {
    if (account) await window.api.registered.snoozeNewYear(account.id);
    bump();
    onClose();
  };

  const remove = async () => {
    if (!account) return;
    const ok = await confirm({
      title: `Delete your ${meta.label}?`,
      description: "It's removed from Saving and from future budgets. Months you've already confirmed keep their numbers.",
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.registered.remove(account.id);
    bump();
    onDeleted?.();
  };

  const last = account?.past_years[0];
  const lastYear = sug ? sug.tax_year - 1 : year - 1;
  const tfsa = tfsaLimit(year);

  return (
    <Sheet
      open
      autoFocus={false}
      onClose={onClose}
      title={mode === 'add' ? 'Add a registered account' : mode === 'edit' ? `Edit ${meta.label}` : `Your ${year} ${meta.label} year`}
      footer={
        <div className="space-y-1">
          <BigButton onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : mode === 'add' ? `Add ${meta.label}` : mode === 'edit' ? 'Save' : `Start ${year}`}
          </BigButton>
          {mode === 'newYear' && (
            <button onClick={notNow} className="w-full py-2 text-[15px] font-medium text-content-muted">
              Not now
            </button>
          )}
        </div>
      }
    >
      <div className="flex justify-center py-2">
        <EmojiAvatar emoji={meta.emoji} color={meta.color} size="lg" />
      </div>

      {mode === 'add' && (kinds?.length ?? 0) > 1 && (
        <SegmentedControl
          className="mb-4"
          value={kind}
          onChange={setKind}
          options={kinds!.map((k) => ({ value: k, label: KIND_META[k].label }))}
        />
      )}

      {mode === 'newYear' && last && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-brand-soft px-3 py-2.5 text-sm">
          <Check size={16} strokeWidth={2.6} className="text-brand shrink-0" />
          <span>
            <span className="font-semibold">{last.tax_year} done:</span> you put in{' '}
            <span className="font-semibold num">{cash(last.contributed)}</span>
            {last.goal ? ` of your ${cash(last.goal)} goal.` : '.'}
          </span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label">Contribution room for {year}</label>
          <MoneyInput value={room} onChange={setRoom} ariaLabel="Contribution room" />
          <p className="text-xs text-content-subtle mt-1.5">
            {mode === 'newYear' && kind === 'tfsa'
              ? `Took money out in ${lastYear}? Add it here, since CRA gives it back on Jan 1.`
              : kind === 'tfsa' && tfsa.amount > 0
                ? `${ROOM_HINT.tfsa} The ${year} limit is ${cash(tfsa.amount)}${tfsa.known ? '' : ' (expected)'}.`
                : ROOM_HINT[kind]}
          </p>
        </div>

        {mode === 'add' && (
          <div>
            <label className="label">Already put in for {year}</label>
            <MoneyInput value={already} onChange={setAlready} ariaLabel="Already put in" />
            <p className="text-xs text-content-subtle mt-1.5">Anything since {shortDate(bounds.start)}. Leave blank if none.</p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <label className="label">Goal by the deadline</label>
            {room !== '' && (
              <button type="button" className="text-xs font-semibold text-brand mb-1.5" onClick={() => setGoal(String(roomValue))}>
                Use all my room
              </button>
            )}
          </div>
          <MoneyInput value={goal} onChange={setGoal} ariaLabel="Goal" />
          {overGoal && (
            <p className="text-xs font-medium text-warning mt-1.5">
              That's more than your room.{' '}
              {kind === 'rrsp' ? 'Up to $2,000 over is allowed before CRA charges 1% a month.' : 'CRA charges 1% a month on the excess.'}
            </p>
          )}
        </div>

        <div>
          <label className="label">Deadline</label>
          <input
            type="date"
            className="input text-base"
            value={effDeadline}
            min={bounds.start}
            max={bounds.end}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label="Deadline"
          />
          <p className="text-xs text-content-subtle mt-1.5">
            {kind === 'rrsp'
              ? 'RRSP default: 60 days after the year ends. You can pick an earlier date.'
              : 'Default: Dec 31. You can pick an earlier date.'}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface-2 px-3.5 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold">Budget it monthly</div>
            <div className="text-xs text-content-muted num truncate">{preview}</div>
          </div>
          <Toggle on={budgeted} onChange={setBudgeted} label="Budget it monthly" />
        </div>

        {kind === 'fhsa' && (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 accent-[rgb(var(--brand))]"
              checked={lifetimeMax}
              onChange={(e) => setLifetimeMax(e.target.checked)}
            />
            <span>
              I've reached the {cash(FHSA_LIFETIME)} lifetime limit
              <span className="block text-xs text-content-subtle">New years then suggest $0 of room.</span>
            </span>
          </label>
        )}

        {mode === 'edit' && onDeleted && (
          <button onClick={remove} className="w-full py-3 rounded-full bg-danger/10 text-danger text-[15px] font-semibold">
            Delete {meta.label}
          </button>
        )}
      </div>
    </Sheet>
  );
}
