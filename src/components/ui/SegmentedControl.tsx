import { cn } from '@/lib/utils';

/**
 * Pill segmented control. The highlight is one thumb that springs between
 * options instead of each option lighting up on its own. `Reports.tsx` has a
 * local TabButton doing something similar; it should fold into this when that
 * page gets its mobile pass. (Only the phone uses this today.)
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = Math.max(1, options.length);
  return (
    <div
      role="tablist"
      className={cn('relative grid rounded-full bg-surface-3/70 p-1 border border-border', className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-full bg-surface-2 shadow-soft"
        style={{
          width: `calc((100% - 0.5rem) / ${n})`,
          transform: `translateX(${index * 100}%)`,
          transition: 'transform 360ms var(--spring-slide, ease-out)',
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            // The selected label sits on the thumb (a card surface), so it takes card ink.
            data-on-card={active ? '' : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200',
              active ? 'text-content' : 'text-content-muted'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
