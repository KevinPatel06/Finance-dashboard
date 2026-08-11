import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';

/**
 * Shared building blocks for the phone home screen. All three home layouts
 * compose these, so a visual change lands in every layout at once.
 */

function avatarLetter(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Avatar + name + time-of-day greeting. Replaces the title bar on the home screen. */
export function MobileHeader({ action }: { action?: ReactNode }) {
  const { userName } = useTheme();
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-hover grid place-items-center text-white font-semibold shadow-soft shrink-0 dark:text-slate-950">
        {avatarLetter(userName)}
      </div>
      <div className="leading-tight min-w-0 flex-1">
        <div className="text-[15px] font-display font-semibold truncate">
          {userName.trim() || 'Finance'}
        </div>
        <div className="text-xs text-content-subtle">{greeting()}!</div>
      </div>
      {action}
    </div>
  );
}

/**
 * The headline figure. Takes its label and value rather than hardcoding one
 * metric, so layouts can reuse it.
 */
export function MobileHero({
  label,
  value,
  caption,
  aside,
}: {
  label: string;
  value: string;
  caption?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface-2 to-surface-3 px-5 py-7 text-center shadow-card">
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-wider text-content-muted font-medium">
          {label}
        </div>
        <div className="mt-2 text-[2.75rem] leading-none font-display font-semibold num-display">
          {value}
        </div>
        {caption && <div className="mt-2 text-xs text-content-muted">{caption}</div>}
        {aside && <div className="mt-4">{aside}</div>}
      </div>
    </div>
  );
}

/** Row of tappable pills for the one or two things you do most on a phone. */
export function QuickActions({
  actions,
}: {
  actions: Array<{ to: string; label: string; icon: LucideIcon; primary?: boolean }>;
}) {
  return (
    <div className="flex gap-2">
      {actions.map(({ to, label, icon: Icon, primary }) => (
        <Link
          key={to + label}
          to={to}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition active:scale-[0.98]',
            primary
              ? 'bg-brand text-white dark:text-slate-950 shadow-soft'
              : 'bg-surface-2 border border-border text-content'
          )}
        >
          <Icon size={17} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </div>
  );
}

/** Horizontally scrolling stat cards. Scrolls inside its own container. */
export function StatStrip({
  stats,
}: {
  stats: Array<{ label: string; value: string; tone?: 'brand' | 'danger' | 'default' }>;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex gap-3 w-max">
        {stats.map((s) => (
          <div key={s.label} className="card px-4 py-3 min-w-[7.5rem]">
            <div className="text-[10px] uppercase tracking-wider text-content-muted font-medium">
              {s.label}
            </div>
            <div
              className={cn(
                'mt-1 text-lg font-display font-semibold num-display',
                s.tone === 'brand' && 'text-brand',
                s.tone === 'danger' && 'text-danger'
              )}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Section title with an optional "See all" link. */
export function SectionHeader({ title, to }: { title: string; to?: string }) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <h2 className="text-sm font-display font-semibold">{title}</h2>
      {to && (
        <Link to={to} className="text-xs text-brand inline-flex items-center gap-0.5">
          See all <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

/**
 * Colored circular icon + title + subtitle + right-aligned value. The row shape
 * from the reference designs; Bills/Expenses/Goals lists should adopt it too.
 */
export function ListRow({
  icon: Icon,
  color,
  title,
  subtitle,
  value,
  valueTone = 'default',
  trailing,
}: {
  icon: LucideIcon;
  color?: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: 'default' | 'danger' | 'brand' | 'muted';
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="w-10 h-10 rounded-full grid place-items-center shrink-0"
        style={color ? { backgroundColor: `${color}1f`, color } : undefined}
      >
        <Icon size={18} strokeWidth={2} className={color ? undefined : 'text-content-muted'} />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
      </div>
      {value && (
        <div
          className={cn(
            'text-sm font-semibold num shrink-0',
            valueTone === 'danger' && 'text-danger',
            valueTone === 'brand' && 'text-brand',
            valueTone === 'muted' && 'text-content-muted'
          )}
        >
          {value}
        </div>
      )}
      {trailing}
    </div>
  );
}

/** Card wrapper that hairlines between rows without a border on the last one. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="card divide-y divide-border overflow-hidden">{children}</div>;
}
