import { useEffect, useRef } from 'react';

/**
 * What the Android back button should close, topmost last. Sheets, dialogs
 * and the setup flow register while they're open; the back button runs the
 * top one. Registration order is mount order, so a confirm dialog opened over
 * a sheet closes first. Handlers stay registered until their owner removes
 * them (it does when it closes), so one press never closes two things.
 *
 * No DOM or Capacitor here — the desktop registers too, and nothing reads it.
 */
let stack: Array<{ id: number; run: () => void }> = [];
let nextId = 0;

export function pushBack(handler: () => void): () => void {
  const id = ++nextId;
  stack.push({ id, run: handler });
  return () => {
    stack = stack.filter((e) => e.id !== id);
  };
}

/** Runs the top handler. False when nothing is open, so the caller can navigate. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

/** Keeps `handler` registered while `active`. Reads the latest handler through a ref. */
export function useBackHandler(handler: (() => void) | undefined, active: boolean): void {
  const ref = useRef(handler);
  ref.current = handler;
  const enabled = active && !!handler;
  useEffect(() => {
    if (!enabled) return;
    return pushBack(() => ref.current?.());
  }, [enabled]);
}

/** Tests only. */
export function _resetBackStack(): void {
  stack = [];
}
