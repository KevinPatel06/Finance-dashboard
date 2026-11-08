import { useState } from 'react';
import type { RegisteredAccount } from '@shared/types';
import { useToast } from '@/lib/ui';
import { useRefresh } from '../data';
import { monthName, todayIso } from '../dates';
import Sheet from '../ui/Sheet';
import { BigButton, MoneyInput, parseMoney } from '../ui/kit';
import { cash, KIND_META } from './meta';

/**
 * "I deposited it" — the only thing that counts money as contributed. The
 * amount starts at what's left of this month's line; the budget is untouched
 * because the planned amount already came off the top.
 */
export default function DepositSheet({
  account: a,
  onClose,
  onSaved,
}: {
  account: RegisteredAccount;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const { bump } = useRefresh();
  const label = a.label || KIND_META[a.kind].label;
  const month = todayIso().slice(0, 7);
  const leftThisMonth = a.this_month ? Math.max(0, a.this_month.planned - a.this_month.deposited) : 0;
  const [amount, setAmount] = useState(leftThisMonth > 0 ? String(Math.round(leftThisMonth * 100) / 100) : '');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const value = parseMoney(amount);
  const after = Math.round((a.contributed + value) * 100) / 100;

  const save = async () => {
    setBusy(true);
    try {
      await window.api.registered.addContribution({ account_id: a.id, amount: value, date, note: note.trim() || null });
      toast.success(`${cash(value)} logged to your ${label}.`);
      bump();
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      autoFocus={false}
      onClose={onClose}
      title={`Log ${label} deposit`}
      footer={
        <BigButton onClick={save} disabled={!(value > 0) || !date || busy}>
          {busy ? 'Saving…' : 'I deposited it'}
        </BigButton>
      }
    >
      {a.this_month && a.this_month.planned > 0 && (
        <p className="text-center text-sm text-content-muted">
          {monthName(month)} plan: {cash(a.this_month.planned)} · {cash(a.this_month.deposited)} in so far
        </p>
      )}
      <div className="py-5">
        <MoneyInput big value={amount} onChange={setAmount} ariaLabel="Deposit amount" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className="input text-base"
          value={date}
          max="2100-12-31"
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
        />
        <input
          className="input text-base"
          placeholder="Note (optional)"
          value={note}
          maxLength={80}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {value > 0 && (
        <p className="mt-3 rounded-2xl bg-surface-3 px-3 py-2.5 text-xs text-content-muted num">
          After this:{' '}
          <span className="font-semibold text-content">
            {a.goal != null && a.goal > 0 ? `${cash(after)} of ${cash(a.goal)}` : `${cash(after)} this year`}
          </span>
          . Putting in more than planned lowers the months ahead.
        </p>
      )}
    </Sheet>
  );
}
