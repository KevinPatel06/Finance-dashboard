/**
 * Dispatched on `window` when the app returns to the foreground on a later day
 * than it was last active. iOS keeps a backgrounded app suspended, often for
 * days, so anything worked out from "today" is stale until screens refetch.
 */
export const DAY_CHANGED = 'finance:day-changed';
