import { useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
 * it. One highlight springs between tabs. On pushed screens (a category, a
 * fund, Settings…) the bar slides down out of the way and comes back on return.
 */
export default function TabBar({ onPlus }: { onPlus: () => void }) {
  const { pathname } = useLocation();
  const current = TAB_PATHS.indexOf(pathname);
  const visible = current >= 0;
  // Off a tab, the highlight stays where it was so it doesn't jump on return.
  const last = useRef(0);
  if (visible) last.current = current;

  return (
    <div
      className={cn(
        'fixed z-30 inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] px-4',
        'transition-[transform,opacity] duration-300',
        visible ? 'ease-[cubic-bezier(0.16,1,0.3,1)]' : 'translate-y-[140%] opacity-0 pointer-events-none ease-in'
      )}
      aria-hidden={!visible}
    >
      <div className="max-w-xl mx-auto flex items-center gap-3">
        <nav className="relative flex-1 grid grid-cols-3 p-1.5 rounded-full border border-border bg-surface-2/90 backdrop-blur-xl shadow-pop">
          <span
            aria-hidden
            className="absolute top-1.5 bottom-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] rounded-full bg-brand-soft"
            style={{
              transform: `translateX(${last.current * 100}%)`,
              transition: 'transform 360ms var(--spring-slide, ease-out)',
            }}
          />
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="press [--dip:0.92] relative min-w-0" tabIndex={visible ? 0 : -1}>
              {({ isActive }) => (
                <span
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-full py-2 transition-colors duration-200',
                    isActive ? 'text-brand' : 'text-content-muted'
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
          tabIndex={visible ? 0 : -1}
          className="press [--dip:0.9] w-[60px] h-[60px] shrink-0 rounded-full bg-content text-surface shadow-pop grid place-items-center"
        >
          <Plus size={30} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
