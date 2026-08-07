import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  Target,
  CalendarDays,
  BarChart3,
  ShoppingCart,
  TrendingDown,
  Landmark,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';

// Exported so BottomNav renders the same destinations — one source of truth.
export const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/paychecks', label: 'Paychecks', icon: Wallet },
  { to: '/expenses', label: 'Expenses', icon: ShoppingCart },
  { to: '/bills', label: 'Bills', icon: Receipt },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/registered', label: 'Registered', icon: Landmark },
  { to: '/payoff', label: 'Payoff', icon: TrendingDown },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function avatarLetter(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  // First character of the first non-whitespace word, uppercased.
  return t.charAt(0).toUpperCase();
}

export default function Sidebar() {
  const { userName } = useTheme();
  const heading = userName.trim() ? `${userName.trim()}'s Finance` : 'Finance';

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-surface-2 flex-col">
      <div className="px-5 pt-6 pb-7">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-hover grid place-items-center text-white font-bold shadow-soft shrink-0 dark:text-slate-950">
            {avatarLetter(userName)}
          </div>
          <div className="leading-tight min-w-0">
            <div
              className="text-[15px] font-display font-semibold text-content truncate"
              title={heading}
            >
              {heading}
            </div>
            <div className="text-xs text-content-subtle">Personal dashboard</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                isActive
                  ? 'bg-brand-soft text-brand dark:text-brand'
                  : 'text-content-muted hover:text-content hover:bg-surface-3'
              )
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 text-xs text-content-subtle border-t border-border">
        v1.0.0
      </div>
    </aside>
  );
}
