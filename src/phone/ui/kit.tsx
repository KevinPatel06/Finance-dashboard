import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { fillTint, iconInk, pastel } from './pastel';
import { iconFor } from './icons';

/**
 * The phone's visual vocabulary, after DaTrack: line icons on pastel circles,
 * hatched progress tracks with a % badge, soft rounded cards, circle nav
 * buttons and full-width pill CTAs. Everything reads the theme tokens, so
 * light/dark and the accent picker keep working.
 */

// ---------------------------------------------------------------- avatar

const AVATAR = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-11 h-11',
  lg: 'w-14 h-14',
  xl: 'w-24 h-24',
} as const;
const GLYPH = { xs: 14, sm: 17, md: 20, lg: 26, xl: 44 } as const;

/**
 * An item's line icon on its pastel circle. Takes the stored emoji and draws
 * the matching icon (ui/icons.ts); the emoji itself is never shown.
 */
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
  const Icon = iconFor(emoji);
  return (
    <span
      className={cn('rounded-full grid place-items-center shrink-0 select-none leading-none', AVATAR[size], className)}
      style={{ backgroundColor: pastel(color, theme), color: iconInk(color) }}
      aria-hidden
    >
      <Icon size={GLYPH[size]} strokeWidth={size === 'xl' ? 1.6 : 1.9} />
    </span>
  );
}

/** A bare line icon for a stored emoji, sized to sit in a line of text. */
export function EmojiIcon({
  emoji,
  size = 16,
  className,
  strokeWidth = 2,
}: {
  emoji: string | null | undefined;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = iconFor(emoji);
  return <Icon size={size} strokeWidth={strokeWidth} className={cn('shrink-0', className)} aria-hidden />;
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
  // Start empty and fill on the next frame, so a screen opening shows the bars grow.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
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
          className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: shown ? `${w}%` : '0%',
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

/**
 * The hero of a category screen: how much of the budget is left, as a ring in
 * the category's tint. Same footprint as the xl avatar it replaced (96px).
 * `pct` null = no budget this month; `over` paints the whole ring danger.
 */
export function PercentRing({ pct, color, over }: { pct: number | null; color: string; over?: boolean }) {
  const { theme } = useTheme();
  const SIZE = 96;
  const STROKE = 9;
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const w = over ? 100 : Math.max(0, Math.min(100, pct ?? 0));
  // Start empty and fill on the next frame, like HatchedBar.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className="relative w-24 h-24 shrink-0"
      role="progressbar"
      aria-valuenow={Math.round(w)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={pct === null ? 'No budget this month' : over ? 'Over budget' : `${Math.round(w)}% left`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={STROKE} />
        {w > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke={over ? 'rgb(var(--danger) / 0.55)' : fillTint(color, theme)}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={shown ? c * (1 - w / 100) : c}
            className="transition-[stroke-dashoffset] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center leading-none">
        <span className={cn('text-[22px] font-display font-bold num', over && 'text-danger')}>
          {pct === null ? '—' : over ? 'Over' : `${Math.round(w)}%`}
        </span>
        <span className="text-[11px] text-content-subtle mt-1">{pct === null ? 'no budget' : over ? 'budget' : 'left'}</span>
      </div>
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
        onClick && 'press [--dip:0.98]',
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

/** Icon + title/subtitle + trailing value, the row shape used everywhere. */
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
      className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', onClick && 'transition-colors active:bg-surface-3/60')}
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
        'press [--dip:0.9] w-10 h-10 rounded-full grid place-items-center shrink-0 border',
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
        'press [--dip:0.97] relative w-full h-14 rounded-full text-[17px] font-semibold',
        'disabled:opacity-40 flex items-center justify-center gap-2',
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
        'press [--dip:0.94] inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap',
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
const BANNER_ICON = {
  brand: 'text-brand',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-content-muted',
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
      className={cn('w-full text-left rounded-[20px] border px-4 py-3.5 flex gap-3 items-start', onClick && 'press [--dip:0.98]', BANNER_TONE[tone])}
    >
      {icon && (
        // w-7: the width the emoji used to take, so banner text wraps exactly as before.
        <div className={cn('w-7 flex justify-center text-xl leading-none pt-0.5 shrink-0', BANNER_ICON[tone])}>
          {typeof icon === 'string' ? <EmojiIcon emoji={icon} size={20} /> : icon}
        </div>
      )}
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
