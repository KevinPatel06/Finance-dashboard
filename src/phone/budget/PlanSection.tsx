import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionTitle } from '../ui/kit';

/**
 * One part of the plan (Income, Recurring, Debt, Funds, Contributions,
 * Spending). In the Edit plan sheet it folds down to a single row — colour
 * dot, name, total — so the whole month fits on one screen; tap to open it.
 * Elsewhere (setup) it's a plain titled section, always open.
 */
export default function PlanSection({
  title,
  subtitle,
  total,
  color,
  collapsible,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  total?: string;
  /** The dot colour, matching the plan bar. Omit for a hollow dot (income). */
  color?: string;
  collapsible?: boolean;
  /** A small action shown when the section is open, e.g. "+ Add fund". */
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!collapsible) {
    return (
      <>
        <SectionTitle right={action ?? (total ? <span className="text-sm text-content-muted num">{total}</span> : undefined)}>
          {title}
        </SectionTitle>
        {children}
      </>
    );
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'press [--dip:0.98] w-full flex items-center gap-3 px-4 py-3 text-left rounded-[20px] bg-surface-2 border border-border/70 shadow-card'
        )}
      >
        <span
          className={cn('w-3 h-3 rounded-full shrink-0', !color && 'border-[2.5px] border-brand')}
          style={color ? { backgroundColor: color } : undefined}
          aria-hidden
        />
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block text-base font-semibold truncate">{title}</span>
          {subtitle && <span className="block text-[13px] text-content-subtle truncate mt-0.5">{subtitle}</span>}
        </span>
        {total && <span className="text-base font-semibold num shrink-0">{total}</span>}
        <ChevronDown
          size={18}
          className={cn('text-content-subtle shrink-0 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div className="mt-2 animate-page-in">
          {action && <div className="flex justify-end px-1 mb-1.5">{action}</div>}
          {children}
        </div>
      )}
    </div>
  );
}
