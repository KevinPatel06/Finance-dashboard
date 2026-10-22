import { NavLink } from 'react-router-dom';
import { Gauge, LayoutGrid, PieChart, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/', label: 'Budget', icon: Gauge },
  { to: '/expenses', label: 'Expenses', icon: PieChart },
  { to: '/more', label: 'More', icon: LayoutGrid },
];

export const TAB_PATHS = TABS.map((t) => t.to);

/**
 * DaTrack's floating pill of tabs with the + as its own round button beside
 * it. Uses the accent tokens, so the accent picker still applies.
 */
export default function TabBar({ onPlus }: { onPlus: () => void }) {
  return (
    <div className="fixed z-30 inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] px-4">
      <div className="max-w-xl mx-auto flex items-center gap-3">
        <nav className="flex-1 flex items-center gap-1 p-1.5 rounded-full border border-border bg-surface-2/90 backdrop-blur-xl shadow-pop">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
              {({ isActive }) => (
                <span
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-full py-2 transition',
                    isActive ? 'bg-brand-soft text-brand' : 'text-content-muted'
                  )}
                >
                  <Icon size={21} strokeWidth={2.1} />
                  <span className="text-[11px] font-semibold leading-none">{label}</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={onPlus}
          aria-label="Log an expense"
          className="w-[60px] h-[60px] shrink-0 rounded-full bg-brand text-white dark:text-slate-950 shadow-pop grid place-items-center transition active:scale-95"
        >
          <Plus size={30} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
