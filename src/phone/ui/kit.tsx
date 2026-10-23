import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { fillTint, pastel } from './pastel';

/**
 * The phone's visual vocabulary, after DaTrack: emoji on pastel circles,
 * hatched progress tracks with a % badge, soft rounded cards, circle nav
 * buttons and full-width pill CTAs. Everything reads the theme tokens, so
 * light/dark and the accent picker keep working.
 */

// ---------------------------------------------------------------- avatar

const AVATAR = {
  xs: 'w-7 h-7 text-sm',
  sm: 'w-9 h-9 text-lg',
  md: 'w-11 h-11 text-[22px]',
  lg: 'w-14 h-14 text-[28px]',
  xl: 'w-24 h-24 text-5xl',
} as const;

export function EmojiAvatar({
  emoji,
  color,
  size = 'md',
  className,
}: {
  emoji: string | null | undefined;
  color: string;
  size?: keyof typeof AVATAR;
  className?: string;
}) {
  const { theme } = useTheme();
  return (
    <span
      className={cn('rounded-full grid place-items-center shrink-0 select-none leading-none', AVATAR[size], className)}
      style={{ backgroundColor: pastel(color, theme) }}
      aria-hidden
    >
      {emoji || '📦'}
    </span>
  );
}

// ---------------------------------------------------------------- bar

/**
 * Filled portion = `pct` (0–100) in the item's tint; the rest is fine vertical
 * hatching. The badge sits at the start of the bar, like DaTrack's.
 */
export function HatchedBar({
  pct,
  color,
  badge,
  over,
  height = 'md',
}: {
  pct: number;
  color: string;
  badge?: string;
  over?: boolean;
  height?: 'sm' | 'md';
}) {
  const { theme } = useTheme();
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={cn('relative w-full rounded-md overflow-hidden', height === 'md' ? 'h-[22px]' : 'h-3')}
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="absolute inset-0 text-content-subtle opacity-45"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, currentColor 0 1.5px, transparent 1.5px 5px)',
        }}
      />
      {w > 0 && (
        <div
          className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500"
          style={{
            width: `${w}%`,
            backgroundColor: over ? 'rgb(var(--danger) / 0.55)' : fillTint(color, theme),
          }}
        />
      )}
      {badge && height === 'md' && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 rounded-[5px] bg-white px-1.5 text-[11px] font-semibold leading-[16px] text-slate-900 shadow-soft num">
          {badge}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- surfaces

export function PCard({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'block w-full text-left rounded-[22px] bg-surface-2 border border-border/70 shadow-card',
        onClick && 'transition active:scale-[0.99]',
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** A grouped list card with hairlines between rows. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-[22px] bg-surface-2 border border-border/70 shadow-card divide-y divide-border/70 overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Emoji + title/subtitle + trailing value, the row shape used everywhere. */
export function Row({
  emoji,
  color,
  title,
  subtitle,
  value,
  valueSub,
  valueTone,
  onClick,
  chevron,
  leading,
  trailing,
}: {
  emoji?: string | null;
  color?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueSub?: ReactNode;
  valueTone?: 'default' | 'danger' | 'success' | 'muted';
  onClick?: () => void;
  chevron?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', onClick && 'active:bg-surface-3/60')}
    >
      {leading}
      {emoji !== undefined && color && <EmojiAvatar emoji={emoji} color={color} />}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-content-subtle truncate mt-0.5">{subtitle}</div>}
      </div>
      {value !== undefined && (
        <div className="text-right shrink-0">
          <div
            className={cn(
              'text-[15px] font-semibold num',
              valueTone === 'danger' && 'text-danger',
              valueTone === 'success' && 'text-success',
              valueTone === 'muted' && 'text-content-muted'
            )}
          >
            {value}
          </div>
          {valueSub && <div className="text-[11px] text-content-subtle mt-0.5">{valueSub}</div>}
        </div>
      )}
      {trailing}
      {chevron && <ChevronRight size={18} className="text-content-subtle shrink-0" />}
    </Tag>
  );
}

// ---------------------------------------------------------------- headers

export function CircleButton({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'brand';
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'w-10 h-10 rounded-full grid place-items-center shrink-0 border transition active:scale-95',
        tone === 'brand'
          ? 'bg-brand text-white dark:text-slate-950 border-transparent shadow-soft'
          : 'bg-surface-2 border-border text-content shadow-soft'
      )}
    >
      <Icon size={19} strokeWidth={2.2} />
    </button>
  );
}

/**
 * Big bold page title on the left, DaTrack's "Budget" header. The right
 * action stops short of the pinned theme button (ThemeButton).
 */
export function LargeHeader({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 pt-2 pb-1 pr-12">
      <div className="min-w-0">
        <h1 className="text-[32px] leading-tight font-display font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="text-sm font-medium mt-0.5">{subtitle}</div>}
      </div>
      {right && <div className="h-10 flex items-center shrink-0">{right}</div>}
    </div>
  );
}

/**
 * Circle back button, centred title, optional right action. The pinned theme
 * button takes the right-hand slot, so a right action sits just left of it
 * (and both outer columns widen to keep the title centred).
 */
export function NavHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div className={cn('grid items-center gap-2 py-2', right ? 'grid-cols-[5.5rem_1fr_5.5rem]' : 'grid-cols-[2.5rem_1fr_2.5rem]')}>
      <CircleButton icon={ChevronLeft} label="Back" onClick={onBack ?? (() => navigate(-1))} />
      <div className="text-center min-w-0">
        {title && <div className="text-[17px] font-semibold truncate">{title}</div>}
        {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
      </div>
      <div className="flex justify-end pr-12">{right}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mt-6 mb-2">
      <h2 className="text-[17px] font-display font-semibold">{children}</h2>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------- actions

export function BigButton({
  children,
  onClick,
  disabled,
  tone = 'content',
  icon: Icon,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'content' | 'brand' | 'outline' | 'danger';
  icon?: LucideIcon;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative w-full h-14 rounded-full text-[17px] font-semibold transition active:scale-[0.99]',
        'disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2',
        tone === 'content' && 'bg-content text-surface shadow-pop',
        tone === 'brand' && 'bg-brand text-white dark:text-slate-950 shadow-pop',
        tone === 'outline' && 'bg-surface-2 border border-border text-content',
        tone === 'danger' && 'bg-danger/10 text-danger'
      )}
    >
      {children}
      {Icon && <Icon size={20} className="absolute right-6" />}
    </button>
  );
}

/** Small rounded chip button, e.g. "+ Add money". */
export function Chip({
  children,
  onClick,
  icon: Icon,
  active,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-95 whitespace-nowrap',
        active ? 'bg-content text-surface' : 'bg-surface-3 text-content',
        className
      )}
    >
      {Icon && <Icon size={15} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

const BANNER_TONE = {
  brand: 'bg-brand-soft/60 text-content border-brand/25',
  warning: 'bg-warning/10 border-warning/30',
  danger: 'bg-danger/10 border-danger/30',
  neutral: 'bg-surface-2 border-border/70',
} as const;

export function Banner({
  tone = 'neutral',
  icon,
  title,
  children,
  action,
  onClick,
}: {
  tone?: keyof typeof BANNER_TONE;
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn('w-full text-left rounded-[20px] border px-4 py-3.5 flex gap-3 items-start', BANNER_TONE[tone])}
    >
      {icon && <div className="text-xl leading-none pt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold leading-snug">{title}</div>
        {children && <div className="text-sm text-content-muted mt-0.5 leading-snug">{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </Tag>
  );
}

// ---------------------------------------------------------------- inputs

/** A money field with a leading $; `big` is the centred hero version. */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  big,
  placeholder = '0',
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  big?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const clean = (v: string) => v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  if (big) {
    return (
      <div className="flex items-center justify-center gap-1 font-display font-bold">
        <span className="text-4xl text-content-subtle">$</span>
        <input
          className="bg-transparent text-5xl w-full max-w-[14rem] text-center outline-none num placeholder:text-content-subtle/50"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          onChange={(e) => onChange(clean(e.target.value))}
        />
      </div>
    );
  }
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle">$</span>
      <input
        className="input pl-7 num text-base"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => onChange(clean(e.target.value))}
      />
    </div>
  );
}

/** Parse a MoneyInput string; NaN-safe. */
export const parseMoney = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** Three-up stat row: Budget · Spent · Next budget. */
export function StatTrio({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-border/70">
      {items.map((it) => (
        <div key={it.label} className="px-3 first:pl-0 last:pr-0 text-center first:text-left last:text-right">
          <div className="text-xs text-content-subtle">{it.label}</div>
          <div className="text-[15px] font-semibold num mt-0.5 truncate">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
