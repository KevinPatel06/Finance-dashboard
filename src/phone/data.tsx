import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BudgetMonthView } from '@shared/types';
import { DAY_CHANGED } from '@/platform/events';

/**
 * Phone data plumbing. Screens fetch through `useApi`, which re-runs whenever
 * the app-wide refresh version is bumped — so the quick-add sheet (which lives
 * above every screen) can save expenses and the visible screen updates.
 */

interface RefreshCtx {
  version: number;
  bump: () => void;
}

const Ctx = createContext<RefreshCtx>({ version: 0, bump: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Resuming on a new day: refetch so the month, safe-per-day, payday cards
  // and "Today" labels catch up.
  useEffect(() => {
    window.addEventListener(DAY_CHANGED, bump);
    return () => window.removeEventListener(DAY_CHANGED, bump);
  }, [bump]);

  return <Ctx.Provider value={{ version, bump }}>{children}</Ctx.Provider>;
}

export const useRefresh = () => useContext(Ctx);

/** Runs `fn` on mount, when `deps` change, and on every refresh bump. */
export function useApi<T>(
  fn: () => Promise<unknown>,
  deps: unknown[] = []
): { data: T | null; reload: () => Promise<void> } {
  const { version } = useRefresh();
  const [data, setData] = useState<T | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = (await fnRef.current()) as T;
      // A slower, older request must never overwrite a newer one.
      if (mine === seq.current) setData(result);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, reload, ...deps]);

  return { data, reload };
}

/** The current (or given) month's budget view. */
export const useMonth = (month?: string) =>
  useApi<BudgetMonthView>(() => window.api.budget.month(month), [month]);
