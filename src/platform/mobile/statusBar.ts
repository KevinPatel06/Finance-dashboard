import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** `--surface` under `html.phone` (index.css): Beige in light, Charcoal in dark. */
const PAGE = { light: '#EEE5D5', dark: '#1D1E1C' } as const;

/**
 * Android's status bar sits above the web view with its own colour, so make it
 * the page colour and pick icon ink that reads on it. iOS draws the page under
 * a transparent bar already, so it's left alone.
 */
export function setStatusBar(theme: 'light' | 'dark'): void {
  if (Capacitor.getPlatform() !== 'android') return;
  // Style.Light = dark icons (for a light bar); Style.Dark = light icons.
  void StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
  void StatusBar.setBackgroundColor({ color: PAGE[theme] }).catch(() => {});
}
