import { useState } from 'react';
import type { Debt, DebtType } from '@shared/types';
import { periodRate } from '@shared/debtMath';
import { FREQ_LABEL } from '@/lib/debtMath';
import { useConfirm } from '@/lib/ui';
import { useRefresh } from '../data';
import { money } from '../format';
import Sheet from '../ui/Sheet';
import { BigButton, MoneyInput, parseMoney } from '../ui/kit';

const TYPES: Array<{ value: DebtType; label: string }> = [
  { value: 'credit_card', label: 'Credit card' },
  { value: 'line_of_credit', label: 'Line of credit' },
  { value: 'car_loan', label: 'Car loan' },
  { value: 'loan', label: 'Loan' },
  { value: 'mortgage', label: 'Mortgage' },
];

/**
 * Quick debt entry for setup — the full editor lives on the Payoff page.
 * Pass `debt` to fix a mistake in one already added; it can be deleted too.
 */
export default function DebtSheet({
  debt,
  onClose,
  onSaved,
  onDeleted,
}: {
  debt?: Debt;
  onClose: () => void;
  onSaved: (d: Debt) => void;
  onDeleted?: () => void;
}) {
  const { bump } = useRefresh();
  const confirm = useConfirm();
  const [name, setName] = useState(debt?.name ?? '');
  const [type, setType] = useState<DebtType>(debt?.type ?? 'credit_card');
  const [balance, setBalance] = useState(debt ? String(debt.current_balance) : '');
  const [rate, setRate] = useState(debt ? String(debt.interest_rate) : '');
  const [payment, setPayment] = useState(debt?.payment_amount ? String(debt.payment_amount) : '');
  const [day, setDay] = useState(debt?.interest_day != null ? String(debt.interest_day) : '');
  const [busy, setBusy] = useState(false);

  const revolving = type === 'credit_card' || type === 'line_of_credit';
  // Keep a debt's own compounding unless its type changes.
  const compounding = debt && debt.type === type ? debt.compounding : type === 'mortgage' ? 'semi_annual' : 'monthly';
  const apr = Number(rate) || 0;
  const interest = parseMoney(balance) * periodRate(apr, 'monthly', compounding);
  const valid = name.trim() && parseMoney(balance) > 0;
  const freq = debt?.payment_frequency ?? 'monthly';

  const save = async () => {
    setBusy(true);
    try {
      const fields = {
        name: name.trim(),
        type,
        current_balance: parseMoney(balance),
        interest_rate: apr,
        payment_amount: parseMoney(payment),
        interest_day: revolving && Number(day) >= 1 && Number(day) <= 31 ? Number(day) : null,
        compounding,
      };
      const d = (debt
        ? await window.api.debts.update(debt.id, {
            ...fields,
            // A balance fixed during setup is still the starting balance —
            // unless the debt already has payoff progress to keep.
            original_amount:
              debt.original_amount === debt.current_balance ? fields.current_balance : debt.original_amount,
          })
        : await window.api.debts.create({
            ...fields,
            original_amount: fields.current_balance,
            payment_frequency: 'monthly',
            split_count: 1,
          })) as Debt;
      bump();
      onSaved(d);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!debt) return;
    const ok = await confirm({
      title: `Delete ${debt.name}?`,
      description: 'It’s removed from your debts and your budget.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.debts.remove(debt.id);
    bump();
    onDeleted?.();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={debt ? 'Edit debt' : 'Add a debt'}
      footer={
        <BigButton onClick={save} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </BigButton>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Visa" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input text-base" value={type} onChange={(e) => setType(e.target.value as DebtType)}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Balance owing</label>
            <MoneyInput value={balance} onChange={setBalance} ariaLabel="Balance" />
          </div>
          <div>
            <label className="label">Interest rate (APR %)</label>
            <input
              className="input text-base num"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="19.99"
            />
          </div>
          <div>
            <label className="label">{FREQ_LABEL[freq]} payment</label>
            <MoneyInput value={payment} onChange={setPayment} ariaLabel={`${FREQ_LABEL[freq]} payment`} />
          </div>
          {revolving && (
            <div>
              <label className="label">Interest day</label>
              <input
                className="input text-base num"
                inputMode="numeric"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                placeholder="e.g. 15"
              />
            </div>
          )}
        </div>
        {interest > 0 && (
          <p className="text-sm text-content-muted rounded-2xl bg-warning/10 px-4 py-3">
            This costs about <span className="font-semibold text-content num">{money(interest)}</span> in interest every month
            {compounding === 'semi_annual' ? ' (Canadian semi-annual compounding)' : ''}.
          </p>
        )}
        {debt && onDeleted && (
          <button onClick={remove} className="w-full py-3 rounded-full bg-danger/10 text-danger text-[15px] font-semibold">
            Delete debt
          </button>
        )}
      </div>
    </Sheet>
  );
}
