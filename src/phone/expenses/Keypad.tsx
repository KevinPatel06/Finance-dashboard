import { Delete } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/** Apply one keypad press to a money string: one decimal point, two decimals, nine digits. */
export function pressKey(value: string, key: (typeof KEYS)[number]): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === '.') return value.includes('.') ? value : value === '' ? '0.' : `${value}.`;
  const [whole, cents] = value.split('.');
  if (cents !== undefined && cents.length >= 2) return value;
  if (cents === undefined && whole.replace(/^0+/, '').length >= 7) return value;
  if (value === '0') return key;
  return value + key;
}

/**
 * The Log expense sheet's own number pad, so typing an amount never raises the
 * phone keyboard over the form (iOS scrolled the sheet away from the top).
 */
export default function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Amount keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k}
          onClick={() => onChange(pressKey(value, k))}
          className="press [--dip:0.94] h-11 rounded-xl bg-surface-2 border border-border/70 text-[22px] font-display font-semibold grid place-items-center num"
        >
          {k === 'del' ? <Delete size={22} strokeWidth={2} /> : k}
        </button>
      ))}
    </div>
  );
}
