import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { handleBack } from '@/lib/backStack';

/**
 * Android's back button / back gesture. Listening replaces Capacitor's
 * default (WebView history back, else close the app) with: close the top
 * sheet or dialog; otherwise let the app decide — step back a screen, or on a
 * root tab send the app to the background like other Android apps.
 */
export function listenForBack(fallback: () => 'minimize' | void): () => void {
  if (Capacitor.getPlatform() !== 'android') return () => {};
  const listener = App.addListener('backButton', () => {
    if (handleBack()) return;
    if (fallback() === 'minimize') void App.minimizeApp();
  });
  return () => {
    void listener.then((h) => h.remove());
  };
}
