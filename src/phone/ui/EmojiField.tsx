import { cn } from '@/lib/utils';
import { iconFor, PICKABLE, sameIcon } from './icons';

/**
 * Pick an item's icon from a grid. Stores the emoji the icon stands for
 * (ui/icons.ts), so the data, suggestions and export are unchanged.
 */
export default function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-9 gap-1">
      {PICKABLE.map((e) => {
        const Icon = iconFor(e);
        const on = sameIcon(value, e);
        return (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            aria-pressed={on}
            aria-label={Icon.displayName}
            className={cn(
              'aspect-square rounded-xl grid place-items-center press [--dip:0.88]',
              on ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-3/70'
            )}
          >
            <Icon size={19} strokeWidth={1.9} />
          </button>
        );
      })}
    </div>
  );
}
