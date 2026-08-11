import { cn } from '@/lib/utils';

/**
 * Pill segmented control. `Reports.tsx` has a local TabButton doing something
 * similar; it should fold into this when that page gets its mobile pass.
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
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 rounded-full bg-surface-3/70 p-1 border border-border', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition',
              active ? 'bg-surface-2 text-content shadow-soft' : 'text-content-muted'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
