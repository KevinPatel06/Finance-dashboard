import { cn } from '@/lib/utils';

const CHOICES = [
  '🏠', '🛒', '🍔', '☕', '🛵', '⛽', '🚌', '🚗', '📱', '🌐', '💡', '🛡️',
  '💊', '🧘', '💆', '🛍️', '🎬', '📺', '✈️', '🎁', '🐶', '📚', '🧸', '🍷',
  '💳', '💰', '🆘', '💻', '💍', '🏖️', '🎮', '🎵', '👕', '🧾', '💝', '📦',
];

/** Last grapheme of a string — so pasting or typing replaces the emoji. */
function lastGrapheme(v: string): string {
  const Seg = (Intl as unknown as { Segmenter?: new () => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (!Seg) return Array.from(v).pop() ?? '';
  let last = '';
  for (const s of new Seg().segment(v)) last = s.segment;
  return last;
}

/** Pick an emoji from a grid, or type any emoji into the box. */
export default function EmojiField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <input
          className="input w-16 text-center text-2xl py-1.5"
          value={value}
          onChange={(e) => onChange(lastGrapheme(e.target.value.trim()))}
          aria-label="Emoji"
          data-no-autofocus
        />
        <span className="text-xs text-content-subtle">Tap one below or type any emoji.</span>
      </div>
      <div className="grid grid-cols-9 gap-1">
        {CHOICES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            className={cn(
              'aspect-square rounded-xl text-xl grid place-items-center transition active:scale-90',
              value === e ? 'bg-brand-soft ring-2 ring-brand' : 'bg-surface-3/70'
            )}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
