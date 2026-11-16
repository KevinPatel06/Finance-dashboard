import { useState } from 'react';
import type { SavingsGoal } from '@shared/types';
import { useToast } from '@/lib/ui';
import { useApi } from '../data';
import { monthName } from '../dates';
import { money } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton, Group, Row, SectionTitle } from '../ui/kit';

/**
 * Last month ended with spending money left. Months don't roll over, so offer
 * to put it in a fund (logged as a deposit today) or leave it in the bank.
 */
export default function LeftoverSheet({
  month,
  amount,
  onClose,
  onDone,
}: {
  month: string;
  amount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const [busy, setBusy] = useState(false);

  const settle = async (fund: SavingsGoal | null) => {
    setBusy(true);
    try {
      await window.api.budget.settleLeftover(month, fund?.id ?? null, fund ? amount : 0);
      if (fund) toast.success(`${money(amount)} added to ${fund.name}.`);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Left over from ${monthName(month)}`}
      footer={
        <BigButton tone="outline" onClick={() => void settle(null)} disabled={busy}>
          Leave it in the bank
        </BigButton>
      }
    >
      <p className="text-center text-[15px] text-content-muted px-4">
        You didn't spend <span className="text-content font-semibold">{money(amount)}</span> of your{' '}
        {monthName(month)} spending money. Put it in a fund?
      </p>
      {funds && funds.length > 0 ? (
        <>
          <SectionTitle>A fund</SectionTitle>
          <Group>
            {funds.map((f) => (
              <Row
                key={f.id}
                emoji={f.emoji}
                color={f.color}
                title={f.name}
                subtitle={`${money(f.current_amount)} of ${money(f.target_amount)}`}
                chevron
                onClick={() => !busy && void settle(f)}
              />
            ))}
          </Group>
        </>
      ) : (
        <p className="text-sm text-content-subtle text-center mt-6 px-6">
          You don't have any funds yet. Add one in Edit plan to save leftovers like this.
        </p>
      )}
      <p className="text-xs text-content-subtle text-center mt-4 px-6">
        It doesn't carry into this month's budget either way. Each month starts from its own paychecks.
      </p>
    </Sheet>
  );
}
