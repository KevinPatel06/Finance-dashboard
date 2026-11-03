/**
 * Whether the phone shell runs its own iOS-style left-edge swipe-back.
 * Android has a system back gesture from the same edge: running both turns one
 * flick into two "back"s (or a back and then leaving the app), so Android uses
 * the system gesture alone (handled through `onAndroidBack`).
 */
export function appEdgeSwipe(platform: string | undefined): boolean {
  return platform !== 'android';
}

/** The running Capacitor platform, without importing Capacitor (keeps it out of the desktop bundle). */
export function currentPlatform(): string | undefined {
  return (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
}
