import { useEffect, useState } from 'react';
import type { AppSettings, PayFrequency } from '@shared/types';
import { guaranteedPerMonth } from '@shared/paydays';
import { useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { scheduleReminders } from '@/platform';
import { useRefresh } from '../data';
import { money } from '../format';
import { MoneyInput, parseMoney } from '../ui/kit';

export const PAY_FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semi_monthly: 'Twice a month',
  monthly: 'Once a month',
};

/** Phone-only Settings cards: your pay (drives monthly income) and budget reminders. */
export default function PhoneSettingsExtras() {
  const toast = useToast();
  const { bump } = useRefresh();
  const [s, setS] = useState<AppSettings | null>(null);
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<PayFrequency>('biweekly');
  const [next, setNext] = useState('');

  useEffect(() => {
    window.api.settings.get().then((raw) => {
      const v = raw as AppSettings;
      setS(v);
      setAmount(v.pay_amount != null ? String(v.pay_amount) : '');
      setFreq(v.pay_frequency);
      setNext(v.next_paycheck_date ?? '');
    });
  }, []);

  if (!s) return null;

  const update = async (patch: Partial<AppSettings>) => {
    const v = (await window.api.settings.update(patch)) as AppSettings;
    setS(v);
    await scheduleReminders(v);
  };

  const savePay = async () => {
    await window.api.settings.update({
      pay_amount: parseMoney(amount) || null,
      pay_frequency: freq,
      next_paycheck_date: next || null,
    });
    toast.success('Pay saved.');
    bump();
  };

  const monthly = parseMoney(amount) * guaranteedPerMonth(freq);
  const payDirty =
    String(s.pay_amount ?? '') !== amount || s.pay_frequency !== freq || (s.next_paycheck_date ?? '') !== next;

  return (
    <>
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Your pay</h2>
        <p className="text-sm text-content-muted mb-4">
          Your monthly budget plans on the paychecks every month is guaranteed to get. An extra one is a bonus.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Each paycheck</label>
              <MoneyInput value={amount} onChange={setAmount} ariaLabel="Take-home per paycheck" />
            </div>
            <div>
              <label className="label">Next payday</label>
              <input type="date" className="input text-base" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">How often</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PAY_FREQUENCY_LABEL) as PayFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                    freq === f ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface-3'
                  )}
                >
                  {PAY_FREQUENCY_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm text-content-muted">
              {monthly > 0 ? (
                <>
                  <span className="font-semibold text-content num">{money(monthly)}</span> a month to plan with
                </>
              ) : (
                'Enter your take-home pay'
              )}
            </span>
            <button className="btn-primary" onClick={savePay} disabled={!payDirty}>
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-semibold mb-1">Budget reminders</h2>
        <p className="text-sm text-content-muted mb-2">These arrive even when the app is closed.</p>
        <Toggle
          label="Daily log reminder"
          description="A nudge to log the day's spending."
          checked={s.notify_daily_log}
          onChange={(v) => update({ notify_daily_log: v })}
        >
          <input
            type="time"
            className="input w-[7.5rem] py-1.5 text-base"
            value={s.notify_daily_time}
            disabled={!s.notify_daily_log}
            onChange={(e) => e.target.value && update({ notify_daily_time: e.target.value })}
            aria-label="Reminder time"
          />
        </Toggle>
        <Toggle
          label="New month"
          description="On the 1st, to review and confirm your budget."
          checked={s.notify_new_month}
          onChange={(v) => update({ notify_new_month: v })}
        />
        <Toggle
          label="Weekly report"
          description="Monday morning recap of last week."
          checked={s.notify_weekly_report}
          onChange={(v) => update({ notify_weekly_report: v })}
        />
      </div>
    </>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-2.5 border-t border-border first-of-type:border-t-0">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-content-muted">{description}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className={`relative w-11 h-6 rounded-full transition shrink-0 ${
            checked ? 'bg-brand' : 'bg-surface-3 border border-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-soft transition-transform ${
              checked ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
