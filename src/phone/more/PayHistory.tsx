import { useState } from 'react';
import type { PaycheckWithAllocations, Payday } from '@shared/types';
import { fmtDate } from '@/lib/format';
import { useConfirm, useToast } from '@/lib/ui';
import { useApi, useRefresh } from '../data';
import { money } from '../format';
import { Group, NavHeader, Row } from '../ui/kit';
import MoneySheet from '../ui/MoneySheet';

type Item =
  | { kind: 'check'; date: string; check: PaycheckWithAllocations }
  | { kind: 'missed'; date: string; payday: Payday };

/**
 * Every paycheck, newest first, plus scheduled paydays that have none (never
 * confirmed, or removed here). Tap a paycheck to change its amount or remove
 * it; tap a missing payday to enter what you got.
 */
export default function PayHistory() {
  const toast = useToast();
  const confirm = useConfirm();
  const { bump } = useRefresh();
  const { data: checks } = useApi<PaycheckWithAllocations[]>(() => window.api.paychecks.list());
  const { data: missed } = useApi<Payday[]>(() => window.api.paydays.missed());
  const [open, setOpen] = useState<Item | null>(null);

  if (!checks || !missed) return null;

  const items: Item[] = [
    ...checks.map((c): Item => ({ kind: 'check', date: c.payday ?? c.date, check: c })),
    ...missed.map((p): Item => ({ kind: 'missed', date: p.date, payday: p })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const save = async (it: Item, amount: number) => {
    if (it.kind === 'missed') {
      await window.api.paydays.confirm(it.payday.date, amount);
      toast.success(`Logged ${money(amount)} for ${fmtDate(it.payday.date, 'MMM d')}.`);
    } else if (it.check.payday) {
      await window.api.paydays.confirm(it.check.payday, amount);
      toast.success('Paycheck updated.');
    } else {
      const c = it.check;
      await window.api.paychecks.update(c.id, {
        date: c.date,
        amount,
        notes: c.notes,
        allocations: c.allocations.map((a) => ({ kind: a.kind, ref_id: a.ref_id, amount: a.amount, note: a.note })),
      });
      toast.success('Paycheck updated.');
    }
    setOpen(null);
    bump();
  };

  const remove = async (c: PaycheckWithAllocations) => {
    setOpen(null);
    const ok = await confirm({
      title: 'Remove this paycheck?',
      description: c.payday
        ? 'The payday stays in your history as "Not confirmed", so you can enter it again.'
        : 'Anything it paid toward (debts, goals) is undone too.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await window.api.paychecks.remove(c.id);
    toast.success(c.payday ? 'Paycheck removed. Tap the payday to enter it again.' : 'Paycheck removed.');
    bump();
  };

  const total = checks.length;
  return (
    <div className="space-y-4">
      <NavHeader
        title="Pay history"
        subtitle={`${total} paycheck${total === 1 ? '' : 's'}${missed.length ? ` · ${missed.length} not confirmed` : ''}`}
      />
      {items.length === 0 ? (
        <p className="text-sm text-content-subtle text-center py-10">
          Paychecks you confirm on payday show up here.
        </p>
      ) : (
        <Group>
          {items.map((it) =>
            it.kind === 'check' ? (
              <Row
                key={`c${it.check.id}`}
                emoji="💵"
                color="#10b981"
                title={fmtDate(it.date, 'EEE, MMM d, yyyy')}
                subtitle={
                  it.check.payday
                    ? 'Payday check-in'
                    : it.check.allocations.length
                      ? 'Split with the paycheck wizard'
                      : 'Logged'
                }
                value={money(it.check.amount)}
                onClick={() => setOpen(it)}
                chevron
              />
            ) : (
              <Row
                key={`m${it.payday.date}`}
                emoji="💵"
                color="#f59e0b"
                title={fmtDate(it.date, 'EEE, MMM d, yyyy')}
                subtitle="Not confirmed · tap to enter it"
                value={it.payday.expected > 0 ? money(it.payday.expected) : '—'}
                valueSub="expected"
                valueTone="muted"
                onClick={() => setOpen(it)}
                chevron
              />
            )
          )}
        </Group>
      )}

      {open?.kind === 'check' && (
        <MoneySheet
          title="Edit paycheck"
          subtitle={fmtDate(open.date, 'EEEE, MMMM d, yyyy')}
          initial={open.check.amount}
          onClose={() => setOpen(null)}
          onSave={(amount) => save(open, amount)}
        >
          <button
            onClick={() => void remove(open.check)}
            className="w-full py-3 rounded-full bg-danger/10 text-danger text-[15px] font-semibold"
          >
            Remove paycheck
          </button>
        </MoneySheet>
      )}
      {open?.kind === 'missed' && (
        <MoneySheet
          title="How much did you get?"
          subtitle={`Payday ${fmtDate(open.date, 'EEEE, MMMM d, yyyy')}`}
          initial={open.payday.expected > 0 ? open.payday.expected : null}
          cta="Confirm paycheck"
          onClose={() => setOpen(null)}
          onSave={(amount) => save(open, amount)}
        />
      )}
    </div>
  );
}
