import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccentColor, AppSettings, MobileHomeLayout } from '@shared/types';
import { ACCENTS } from './accents';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  accent: AccentColor;
  userName: string;
  /** Which composition the phone home screen uses. Desktop ignores it. */
  homeLayout: MobileHomeLayout;
  /** False until settings have loaded — gates the first paint. */
  ready: boolean;
  /** False only on a genuinely fresh install. */
  onboarded: boolean;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setAccent: (a: AccentColor) => void;
  setUserName: (name: string) => void;
  setHomeLayout: (l: MobileHomeLayout) => void;
  completeOnboarding: () => void;
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
  const [homeLayout, setHomeLayoutState] = useState<MobileHomeLayout>('hero_actions');
  const [ready, setReady] = useState(false);
  // Assume onboarded until settings say otherwise, so a failed read never traps
  // an existing user in the welcome flow.
  const [onboarded, setOnboarded] = useState(true);

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
        setHomeLayoutState(settings.mobile_home_layout || 'hero_actions');
        setOnboarded(settings.onboarded);
        applyTheme(t);
        applyAccent(t, a);
        applyDocumentTitle(n);
      } catch {
        applyTheme('dark');
        applyAccent('dark', 'emerald');
        applyDocumentTitle('Kevin');
      } finally {
        setReady(true);
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

  const setHomeLayout = (l: MobileHomeLayout) => {
    setHomeLayoutState(l);
    window.api.settings.update({ mobile_home_layout: l }).catch(() => {});
  };

  const completeOnboarding = () => {
    setOnboarded(true);
    window.api.settings.update({ onboarded: true }).catch(() => {});
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <Ctx.Provider
      value={{
        theme,
        accent,
        userName,
        homeLayout,
        ready,
        onboarded,
        toggle,
        setTheme,
        setAccent,
        setUserName,
        setHomeLayout,
        completeOnboarding,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
