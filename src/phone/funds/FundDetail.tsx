import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { differenceInMonths, parseISO } from 'date-fns';
import { Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { FundActivityItem, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useCelebration } from '@/lib/celebration';
import { fmtDate } from '@/lib/format';
import { useConfirm, useToast } from '@/lib/ui';
import { useApi, useMonth, useRefresh } from '../data';
import { friendlyDate, monthName, todayIso } from '../dates';
import { money, pct } from '../format';
import MoneySheet from '../ui/MoneySheet';
import Sheet from '../ui/Sheet';
import { Banner, Chip, CircleButton, EmojiAvatar, Group, HatchedBar, NavHeader, PCard, Row, SectionTitle } from '../ui/kit';
import FundEditor from './FundEditor';

type Money = null | 'add' | 'withdraw' | 'plan';

/**
 * A fund: progress toward its target, this month's planned contribution,
 * add money / withdraw, and its full history. Completing is the user's call.
 */
export default function FundDetail() {
  const { id } = useParams();
  const goalId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const { checkForCompletions } = useCelebration();
  const { data: v } = useMonth();
  const { data: active } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: done } = useApi<SavingsGoal[]>(() => window.api.goals.listArchived());
  const { data: activity } = useApi<FundActivityItem[]>(() => window.api.funds.activity(goalId), [goalId]);
  const [sheet, setSheet] = useState<Money>(null);
  const [source, setSource] = useState<'budget' | 'outside'>('budget');
  const [note, setNote] = useState('');
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  const g = [...(active ?? []), ...(done ?? [])].find((x) => x.id === goalId);
  if (!active || !done || !activity || !v) return null;
  if (!g) return <NavHeader title="Fund not found" />;

  const completed = g.archived === 1;
  const p = pct(g.current_amount, g.target_amount);
  const toGo = Math.max(0, g.target_amount - g.current_amount);
  const monthsLeft = g.target_date ? differenceInMonths(parseISO(g.target_date), parseISO(todayIso())) : null;
  const planned = v.lines.fund.find((l) => l.goal_id === goalId)?.amount ?? 0;
  const spentFromFund = activity.filter((a) => a.kind === 'spend').reduce((s, a) => s - a.amount, 0);
  const savedIn = activity.filter((a) => a.amount > 0).reduce((s, a) => s + a.amount, 0);

  const after = async () => {
    setSheet(null);
    setNote('');
    bump();
    await checkForCompletions();
  };

  return (
    <div className="space-y-4">
      <NavHeader title={g.name} right={<CircleButton icon={MoreHorizontal} label="Options" onClick={() => setMenu(true)} />} />

      {completed && (
        <Banner tone="brand" icon="🏁" title={`Completed ${g.archived_at ? fmtDate(g.archived_at.slice(0, 10)) : ''}`}>
          You saved {money(savedIn)} and spent {money(spentFromFund)} from it.
        </Banner>
      )}

      <PCard className="p-5 text-center">
        <div className="flex justify-center mb-4">
          <EmojiAvatar emoji={g.emoji} color={g.color} size="xl" />
        </div>
        <div className="text-[22px] font-display font-bold num">
          {money(g.current_amount)} <span className="text-content-muted font-semibold">of {money(g.target_amount)}</span>
        </div>
        <div className="text-sm text-content-muted mt-1">
          {g.target_date ? `by ${fmtDate(g.target_date, 'MMMM d, yyyy')}` : 'No deadline'}
        </div>
        <div className="mt-5 text-left">
          <HatchedBar pct={p} color={g.color} badge={`${Math.floor(p)}%`} />
          <div className="mt-2 flex justify-between text-sm">
            <span className="font-semibold">{toGo > 0 ? `${money(toGo)} to go` : 'Goal reached 🎉'}</span>
            {monthsLeft != null && toGo > 0 && (
              <span className="text-content-muted">
                {monthsLeft <= 0 ? 'Due now' : `${monthsLeft} month${monthsLeft === 1 ? '' : 's'} left`}
              </span>
            )}
          </div>
        </div>
        {!completed && (
          <div className="flex justify-center gap-2 mt-5">
            <Chip icon={Plus} onClick={() => setSheet('add')}>
              Add money
            </Chip>
            <Chip icon={Minus} onClick={() => setSheet('withdraw')}>
              Withdraw
            </Chip>
          </div>
        )}
      </PCard>

      {!completed && v.status !== 'none' && (
        <Group>
          <Row
            emoji="🗓️"
            color={g.color}
            title={`Planned for ${monthName(v.month)}`}
            subtitle={v.status === 'confirmed' ? 'Added when the month was confirmed' : 'Added when you confirm the month'}
            value={money(planned)}
            chevron
            onClick={() => setSheet('plan')}
          />
        </Group>
      )}

      {toGo === 0 && !completed && (
        <Banner
          tone="brand"
          icon="🎯"
          title="You've reached this goal"
          action={
            <Chip
              active
              onClick={async () => {
                await window.api.goals.remove(g.id);
                toast.success(`${g.name} marked complete.`);
                bump();
              }}
            >
              Mark complete
            </Chip>
          }
        >
          Mark it complete when you're done with it — it stops being planned in new months.
        </Banner>
      )}

      <SectionTitle>Activity</SectionTitle>
      {activity.length === 0 ? (
        <p className="text-sm text-content-subtle px-1">No money in or out yet.</p>
      ) : (
        <Group>
          {activity.map((a) => (
            <Row
              key={a.id}
              title={a.label}
              subtitle={`${friendlyDate(a.date)} · ${KIND_LABEL[a.kind]}`}
              value={`${a.amount < 0 ? '−' : '+'}${money(Math.abs(a.amount))}`}
              valueTone={a.amount < 0 ? 'default' : 'success'}
              trailing={
                a.ref_id != null ? (
                  <button
                    aria-label="Remove"
                    className="p-1.5 -mr-1 text-content-subtle"
                    onClick={async () => {
                      await window.api.funds.removeTransaction(a.ref_id!);
                      bump();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : undefined
              }
            />
          ))}
        </Group>
      )}

      {sheet === 'add' && (
        <MoneySheet
          title={`Add to ${g.name}`}
          cta="Add money"
          onClose={() => setSheet(null)}
          onSave={async (amount) => {
            if (source === 'budget') {
              await window.api.budget.setLine(v.month, 'fund', g.id, planned + amount);
            } else {
              await window.api.funds.addTransaction({ goal_id: g.id, kind: 'deposit', amount, date: todayIso(), note: note.trim() || null });
            }
            toast.success(`${money(amount)} added.`);
            await after();
          }}
        >
          <SegmentedControl
            value={source}
            onChange={setSource}
            options={[
              { value: 'budget', label: "From this month's budget" },
              { value: 'outside', label: 'From somewhere else' },
            ]}
          />
          <p className="text-xs text-content-subtle text-center">
            {source === 'budget'
              ? v.status === 'confirmed'
                ? `Raises ${monthName(v.month)}'s contribution — less left to allocate.`
                : `Raises ${monthName(v.month)}'s contribution; added when you confirm the month.`
              : 'A gift, a refund, savings you already had — your budget is untouched.'}
          </p>
          {source === 'outside' && (
            <input className="input text-base" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-no-autofocus />
          )}
        </MoneySheet>
      )}
      {sheet === 'withdraw' && (
        <MoneySheet
          title={`Withdraw from ${g.name}`}
          subtitle={`Available: ${money(g.current_amount)}. To spend from the fund, log the expense as paid from it instead.`}
          cta="Withdraw"
          onClose={() => setSheet(null)}
          onSave={async (amount) => {
            await window.api.funds.addTransaction({ goal_id: g.id, kind: 'withdrawal', amount, date: todayIso(), note: note.trim() || null });
            toast.success(`${money(amount)} withdrawn.`);
            await after();
          }}
        >
          <input className="input text-base" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-no-autofocus />
        </MoneySheet>
      )}
      {sheet === 'plan' && (
        <MoneySheet
          title={`${monthName(v.month)} contribution`}
          subtitle={`How much of this month's budget goes to ${g.name}.`}
          initial={planned}
          allowZero
          onClose={() => setSheet(null)}
          onSave={async (amount) => {
            await window.api.budget.setLine(v.month, 'fund', g.id, amount);
            await after();
          }}
        />
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={g.name}>
        <Group>
          <Row title="Edit fund" subtitle="Name, emoji, target, deadline" chevron onClick={() => { setMenu(false); setEditing(true); }} />
          {completed ? (
            <Row
              title="Restore"
              subtitle="Move back to active funds"
              onClick={async () => {
                setMenu(false);
                await window.api.goals.restore(g.id);
                bump();
              }}
            />
          ) : (
            <Row
              title="Mark complete"
              subtitle="Stop saving toward it; keep its history"
              onClick={async () => {
                setMenu(false);
                await window.api.goals.remove(g.id);
                toast.success(`${g.name} marked complete.`);
                bump();
              }}
            />
          )}
          <Row
            title={<span className="text-danger">Delete fund</span>}
            subtitle="Removes it and its plan lines for good"
            onClick={async () => {
              setMenu(false);
              const ok = await confirm({
                title: `Delete ${g.name}?`,
                description: 'Its history and plan lines are removed. Purchases paid from it stay, but count as regular spending.',
                confirmLabel: 'Delete',
                destructive: true,
              });
              if (!ok) return;
              await window.api.goals.purge(g.id);
              navigate('/', { replace: true });
            }}
          />
        </Group>
      </Sheet>

      {editing && (
        <FundEditor
          fund={g}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

const KIND_LABEL: Record<FundActivityItem['kind'], string> = {
  contribution: 'monthly plan',
  deposit: 'added',
  withdrawal: 'withdrawn',
  spend: 'paid from fund',
  paycheck: 'paycheck',
};
