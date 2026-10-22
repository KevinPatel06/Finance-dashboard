import { useState } from 'react';
import type { BudgetMonthView, Payday } from '@shared/types';
import { useToast } from '@/lib/ui';
import { friendlyDate } from '../dates';
import { money } from '../format';
import { Banner, Chip, MoneyInput, parseMoney } from '../ui/kit';
import BonusSheet from './BonusSheet';

/**
 * "Did you get paid $1,200 today?" — Yes / Different amount / Not yet.
 * Replaces the Paycheck Wizard on the phone: the monthly plan already says
 * where the money goes, so a payday only needs confirming.
 */
export default function PaydayCard({
  payday: p,
  view,
  onDone,
}: {
  payday: Payday;
  view: BudgetMonthView;
  onDone: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(p.expected <= 0);
  const [amount, setAmount] = useState(p.expected > 0 ? String(p.expected) : '');
  const [bonus, setBonus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async (value: number) => {
    setBusy(true);
    try {
      await window.api.paydays.confirm(p.date, value);
      if (p.kind === 'bonus' && value > 0) {
        setBonus(value);
      } else {
        toast.success(value === p.expected ? 'Paycheck confirmed.' : `Logged ${money(value)} for this payday.`);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const when = friendlyDate(p.date);
  const title =
    p.kind === 'bonus'
      ? `Bonus payday ${when === 'Today' ? 'today' : `on ${when}`}!`
      : p.expected > 0
        ? `Payday ${when === 'Today' ? 'today' : when} — did you get ${money(p.expected)}?`
        : `Payday ${when === 'Today' ? 'today' : when} — how much did you get?`;

  return (
    <>
      <Banner
        tone="brand"
        icon={p.kind === 'bonus' ? '🎉' : '💸'}
        title={title}
        action={
          editing ? (
            <div className="flex w-full items-center gap-2">
              <div className="flex-1">
                <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount you were paid" />
              </div>
              <Chip active onClick={() => void confirm(parseMoney(amount))}>
                {busy ? 'Saving…' : 'Save'}
              </Chip>
            </div>
          ) : (
            <>
              <Chip active onClick={() => void confirm(p.expected)}>
                Yes{p.kind === 'bonus' ? `, ${money(p.expected)}` : ''}
              </Chip>
              <Chip onClick={() => setEditing(true)}>Different amount</Chip>
              <Chip
                onClick={async () => {
                  await window.api.paydays.snooze(p.date);
                  onDone();
                }}
              >
                Not yet
              </Chip>
            </>
          )
        }
      >
        {p.kind === 'bonus'
          ? "Your plan counts on the paychecks every month is guaranteed — this one's extra."
          : 'Confirming it keeps this month’s income accurate.'}
      </Banner>
      {bonus != null && (
        <BonusSheet
          amount={bonus}
          view={view}
          onClose={() => {
            setBonus(null);
            onDone();
          }}
        />
      )}
    </>
  );
}
