import { useState, type ReactNode } from 'react';
import Sheet from './Sheet';
import { BigButton, MoneyInput, parseMoney } from './kit';

/** A sheet that asks for one amount — edit a budget, add money, fix a paycheck. */
export default function MoneySheet({
  title,
  subtitle,
  initial,
  cta = 'Save',
  allowZero,
  children,
  onSave,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  initial?: number | null;
  cta?: string;
  allowZero?: boolean;
  /** Extra fields under the amount (a source toggle, a note…). */
  children?: ReactNode;
  onSave: (amount: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial != null && initial > 0 ? String(initial) : initial === 0 ? '0' : '');
  const [busy, setBusy] = useState(false);
  const amount = parseMoney(value);
  const valid = value !== '' && (allowZero ? amount >= 0 : amount > 0);

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <BigButton
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(amount);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : cta}
        </BigButton>
      }
    >
      {subtitle && <p className="text-center text-sm text-content-muted mb-4">{subtitle}</p>}
      <div className="py-6">
        <MoneyInput big value={value} onChange={setValue} autoFocus ariaLabel={title} />
      </div>
      {children && <div className="space-y-3">{children}</div>}
    </Sheet>
  );
}
