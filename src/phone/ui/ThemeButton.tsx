import { useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';

/**
 * Light/dark switch pinned to the top right of every phone screen. It sits
 * level with the header row (16px below the safe area) and lines up with the
 * right edge of the max-w-xl content column; headers leave room for it.
 * Below sheets (z-50), above the tab bar (z-30).
 *
 * The switch adds `theming` to <html> for a moment so colours cross-fade
 * (index.css) instead of snapping.
 */
export default function ThemeButton() {
  const { theme, toggle } = useTheme();
  const timer = useRef<number>();
  const dark = theme === 'dark';

  const onClick = () => {
    const root = document.documentElement;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theming');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => root.classList.remove('theming'), 420);
    }
    toggle();
  };

  return (
    <button
      onClick={onClick}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="press [--dip:0.9] fixed z-40 w-10 h-10 rounded-full grid place-items-center border border-border bg-surface-2/85 backdrop-blur-md text-content shadow-soft"
      style={{ top: 'calc(env(safe-area-inset-top) + 1rem)', right: 'max(1rem, calc(50vw - 17rem))' }}
    >
      <span key={theme} className="grid place-items-center animate-spin-in">
        {dark ? <Moon size={18} strokeWidth={2.2} /> : <Sun size={19} strokeWidth={2.2} />}
      </span>
    </button>
  );
}
