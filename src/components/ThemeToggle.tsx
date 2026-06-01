import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={cn(
        'relative w-[68px] h-9 rounded-full border border-border bg-surface-3',
        'transition focus:outline-none focus:ring-2 focus:ring-brand/40'
      )}
    >
      <span
        className={cn(
          'absolute top-1 left-1 w-7 h-7 rounded-full grid place-items-center transition-transform duration-300 shadow-soft',
          isDark ? 'translate-x-[32px] bg-slate-900 text-yellow-300' : 'translate-x-0 bg-white text-amber-500'
        )}
      >
        {isDark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
      <span className="sr-only">{isDark ? 'Dark' : 'Light'} mode</span>
    </button>
  );
}
