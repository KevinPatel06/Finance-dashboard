import { useState } from 'react';
import type { Debt, DebtType } from '@shared/types';
import { periodRate } from '@shared/debtMath';
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

/** Quick debt entry for setup — the full editor lives on the Payoff page. */
export default function DebtSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (d: Debt) => void }) {
  const { bump } = useRefresh();
  const [name, setName] = useState('');
  const [type, setType] = useState<DebtType>('credit_card');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [payment, setPayment] = useState('');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);

  const revolving = type === 'credit_card' || type === 'line_of_credit';
  const compounding = type === 'mortgage' ? 'semi_annual' : 'monthly';
  const apr = Number(rate) || 0;
  const interest = parseMoney(balance) * periodRate(apr, 'monthly', compounding);
  const valid = name.trim() && parseMoney(balance) > 0;

  const save = async () => {
    setBusy(true);
    try {
      const d = (await window.api.debts.create({
        name: name.trim(),
        type,
        original_amount: parseMoney(balance),
        current_balance: parseMoney(balance),
        interest_rate: apr,
        payment_amount: parseMoney(payment),
        payment_frequency: 'monthly',
        split_count: 1,
        interest_day: revolving && Number(day) >= 1 && Number(day) <= 31 ? Number(day) : null,
        compounding,
      })) as Debt;
      bump();
      onSaved(d);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a debt"
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
            <label className="label">Monthly payment</label>
            <MoneyInput value={payment} onChange={setPayment} ariaLabel="Monthly payment" />
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
            {type === 'mortgage' ? ' (Canadian semi-annual compounding)' : ''}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
