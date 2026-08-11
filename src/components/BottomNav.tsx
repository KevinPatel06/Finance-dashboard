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

/** Active tabs get a filled chip rather than just colored text. */
const tabInner = (active: boolean) =>
  cn(
    'flex flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5 transition',
    active ? 'bg-brand-soft text-brand' : 'text-content-subtle'
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
            className="absolute bottom-0 inset-x-0 bg-surface-2 border-t border-border rounded-t-3xl p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="More destinations"
          >
            {/* Grabber, so the sheet reads as a sheet. */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
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
                      'flex flex-col items-center gap-2 rounded-2xl py-4 text-xs font-medium transition',
                      isActive ? 'bg-brand-soft text-brand' : 'text-content-muted bg-surface-3/60'
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

      {/* Floating pill, detached from the screen edges and clearing the home
          indicator. Uses the accent tokens so the accent picker still applies. */}
      <nav
        className="md:hidden fixed z-30 left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))]
                   flex items-center justify-around gap-1 px-2 py-2
                   rounded-full border border-border bg-surface-2/90 backdrop-blur-xl shadow-pop"
      >
        {primaryItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="flex-1 min-w-0">
            {({ isActive }) => (
              <span className={tabInner(isActive)}>
                <Icon size={20} strokeWidth={2} />
                <span className="text-[10px] font-medium leading-none truncate">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
        <button className="flex-1 min-w-0" onClick={() => setOpen(true)} aria-expanded={open}>
          <span className={tabInner(open)}>
            <MoreHorizontal size={20} strokeWidth={2} />
            <span className="text-[10px] font-medium leading-none">More</span>
          </span>
        </button>
      </nav>
    </>
  );
}
