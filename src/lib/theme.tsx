import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccentColor, AppSettings } from '@shared/types';
import { ACCENTS } from './accents';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  accent: AccentColor;
  userName: string;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setAccent: (a: AccentColor) => void;
  setUserName: (name: string) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

function applyAccent(theme: Theme, accent: AccentColor) {
  const palette = ACCENTS[accent][theme];
  const root = document.documentElement;
  root.style.setProperty('--brand', palette.brand);
  root.style.setProperty('--brand-hover', palette.brandHover);
  root.style.setProperty('--brand-soft', palette.brandSoft);
}

function applyDocumentTitle(name: string) {
  const trimmed = name.trim();
  document.title = trimmed
    ? `${trimmed}'s Finance Dashboard`
    : 'Finance Dashboard';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [accent, setAccentState] = useState<AccentColor>('emerald');
  const [userName, setUserNameState] = useState<string>('Kevin');

  // Hydrate from settings on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = (await window.api.settings.get()) as AppSettings;
        const t: Theme = settings.theme === 'light' ? 'light' : 'dark';
        const a: AccentColor = settings.accent_color || 'emerald';
        const n: string = settings.user_name || 'Kevin';
        setThemeState(t);
        setAccentState(a);
        setUserNameState(n);
        applyTheme(t);
        applyAccent(t, a);
        applyDocumentTitle(n);
      } catch {
        applyTheme('dark');
        applyAccent('dark', 'emerald');
        applyDocumentTitle('Kevin');
      }
    })();
  }, []);

  // Reapply accent when theme changes so the palette swaps to the light/dark variant
  useEffect(() => {
    applyAccent(theme, accent);
  }, [theme, accent]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    window.api.settings.update({ theme: t }).catch(() => {});
  };

  const setAccent = (a: AccentColor) => {
    setAccentState(a);
    window.api.settings.update({ accent_color: a }).catch(() => {});
  };

  const setUserName = (name: string) => {
    setUserNameState(name);
    applyDocumentTitle(name);
    window.api.settings.update({ user_name: name }).catch(() => {});
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <Ctx.Provider value={{ theme, accent, userName, toggle, setTheme, setAccent, setUserName }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
