import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import TabBar, { TAB_PATHS } from './TabBar';
import QuickAddSheet, { type QuickAddOptions } from './expenses/QuickAddSheet';

interface QuickAddCtx {
  /** Open the + sheet, optionally pre-filled (e.g. from a category page). */
  openQuickAdd: (opts?: QuickAddOptions) => void;
}

const Ctx = createContext<QuickAddCtx>({ openQuickAdd: () => {} });
export const useQuickAdd = () => useContext(Ctx);

/**
 * The phone shell: one scroll container, the floating tab bar on the three
 * top-level tabs, and the quick-add sheet that the + button opens from
 * anywhere.
 */
export default function PhoneLayout() {
  const { pathname } = useLocation();
  const showTabs = TAB_PATHS.includes(pathname);
  const [quickAdd, setQuickAdd] = useState<QuickAddOptions | null>(null);
  const scroller = useRef<HTMLElement>(null);

  // A new screen starts at the top, not wherever the last one was scrolled.
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Ctx.Provider value={{ openQuickAdd: (opts) => setQuickAdd(opts ?? {}) }}>
      <div className="app-shell h-full flex flex-col bg-surface text-content">
        <main ref={scroller} className="app-scroll flex-1 overflow-y-auto">
          <div className={cn('max-w-xl mx-auto px-4 pt-2 animate-fade-in', showTabs ? 'pb-32' : 'pb-12')}>
            <Outlet />
          </div>
        </main>
        {showTabs && <TabBar onPlus={() => setQuickAdd({})} />}
        {quickAdd && <QuickAddSheet options={quickAdd} onClose={() => setQuickAdd(null)} />}
      </div>
    </Ctx.Provider>
  );
}
