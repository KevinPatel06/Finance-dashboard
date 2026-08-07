import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { nav } from './Sidebar';

// Four primary destinations, matching the sidebar's own priority ordering. The
// remaining six live behind More — the iOS-idiomatic pattern for >5 tabs.
const PRIMARY = ['/', '/paychecks', '/expenses', '/bills'];

const primaryItems = nav.filter((n) => PRIMARY.includes(n.to));
const moreItems = nav.filter((n) => !PRIMARY.includes(n.to));

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition',
    isActive ? 'text-brand' : 'text-content-subtle'
  );

export default function BottomNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 animate-fade-in"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="absolute bottom-0 inset-x-0 bg-surface-2 border-t border-border rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="More destinations"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-display font-semibold text-content">More</div>
              <button
                className="p-2 -m-2 text-content-subtle"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-2 rounded-xl py-4 text-xs font-medium transition',
                      isActive ? 'bg-brand-soft text-brand' : 'text-content-muted hover:bg-surface-3'
                    )
                  }
                >
                  <Icon size={20} strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-border bg-surface-2 pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={tabClass}>
            <Icon size={20} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
        <button
          className={cn(
            'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition',
            open ? 'text-brand' : 'text-content-subtle'
          )}
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          <MoreHorizontal size={20} strokeWidth={2} />
          More
        </button>
      </nav>
    </>
  );
}
