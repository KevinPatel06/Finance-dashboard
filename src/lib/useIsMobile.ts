import { useEffect, useState } from 'react';

/** Matches Tailwind's `md` breakpoint, so JS branches and CSS agree. */
const QUERY = '(max-width: 767px)';

/**
 * True on phone-width viewports.
 *
 * Used where a component must genuinely BRANCH rather than render both trees and
 * hide one with `md:hidden` — the mobile dashboard is a different composition,
 * and rendering both would duplicate work for a screen only one of them shows.
 * For anything that's purely a layout difference, prefer the CSS breakpoint.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    // Re-sync in case the viewport changed between first render and effect.
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
