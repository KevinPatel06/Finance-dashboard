import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iconFor, PICKABLE, sameIcon } from './icons';
import { topIcons, type IconContext } from './iconChoices';

/**
 * Pick an item's icon. Shows five suggestions (the current pick, the one that
 * matches the name, then common picks for this editor) and a "See all" that
 * opens the full grid in place. Stores the emoji the icon stands for
 * (ui/icons.ts), so the data, suggestions and export are unchanged.
 */
export default function EmojiField({
  value,
  onChange,
  name,
  context,
}: {
  value: string;
  onChange: (v: string) => void;
  /** The item's name, so the first suggestion can match it. */
  name: string;
  context: IconContext;
}) {
  const [all, setAll] = useState(false);

  const cell = (e: string, size: number) => {
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
        <Icon size={size} strokeWidth={1.9} />
      </button>
    );
  };

  if (all) {
    return (
      <div>
        <div className="grid grid-cols-9 gap-1">{PICKABLE.map((e) => cell(e, 19))}</div>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="mt-2 w-full py-1.5 text-sm font-semibold text-brand"
        >
          Show less
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-1.5">
      {topIcons(value, name, context).map((e) => cell(e, 21))}
      <button
        type="button"
        onClick={() => setAll(true)}
        className="aspect-square rounded-xl grid place-items-center content-center gap-0.5 border-[1.5px] border-dashed border-border-strong text-content-muted press [--dip:0.88]"
      >
        <LayoutGrid size={16} strokeWidth={1.9} />
        <span className="text-[10px] font-semibold leading-none">See all</span>
      </button>
    </div>
  );
}
