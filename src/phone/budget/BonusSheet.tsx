import { useState } from 'react';
import type { BudgetLineKind, BudgetMonthView, Debt, SavingsGoal } from '@shared/types';
import { useToast } from '@/lib/ui';
import { useApi } from '../data';
import { money } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton, Group, Row, SectionTitle } from '../ui/kit';

/**
 * A third paycheck isn't in the plan. Offer to send it straight to a fund or a
 * debt (raising this month's line), or leave it as money to allocate later.
 */
export default function BonusSheet({
  amount,
  view,
  onClose,
}: {
  amount: number;
  view: BudgetMonthView;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());
  const [busy, setBusy] = useState(false);

  const current = (kind: BudgetLineKind, id: number) =>
    (kind === 'fund' ? view.lines.fund.find((l) => l.goal_id === id) : view.lines.debt.find((l) => l.debt_id === id))
      ?.amount ?? 0;

  const send = async (kind: BudgetLineKind, id: number, name: string) => {
    setBusy(true);
    try {
      await window.api.budget.setLine(view.month, kind, id, current(kind, id) + amount);
      toast.success(`${money(amount)} added to ${name}.`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Bonus paycheck 🎉"
      footer={
        <BigButton tone="outline" onClick={onClose} disabled={busy}>
          Decide later
        </BigButton>
      }
    >
      <p className="text-center text-[15px] text-content-muted px-4">
        You got an extra <span className="text-content font-semibold">{money(amount)}</span>. Where should it go?
      </p>
      {funds && funds.length > 0 && (
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
                onClick={() => void send('fund', f.id, f.name)}
              />
            ))}
          </Group>
        </>
      )}
      {debts && debts.length > 0 && (
        <>
          <SectionTitle>A debt</SectionTitle>
          <Group>
            {debts.map((d) => (
              <Row
                key={d.id}
                emoji="💳"
                color="#ef4444"
                title={d.name}
                subtitle={`${money(d.current_balance)} owing`}
                chevron
                onClick={() => void send('debt', d.id, d.name)}
              />
            ))}
          </Group>
        </>
      )}
      <p className="text-xs text-content-subtle text-center mt-4 px-6">
        Leaving it for later keeps it as money to allocate in this month's plan.
      </p>
    </Sheet>
  );
}
