import { onlineManager } from '@tanstack/react-query';

/** Opens of one show within this window share a single refresh. */
export const SHOW_OPEN_REFRESH_GAP_MS = 15_000;

const lastRefreshAt = new Map<string, number>();

/**
 * May this open of a show start a background entries refresh (MYK9-1064)?
 *
 * Claims the slot when it answers yes. Online only; opens inside the gap share
 * the refresh the first one started; a hidden tab refreshes a show once per page
 * session, so a background invalidation cannot turn into a poll.
 */
export function claimShowOpenRefresh(showId: string): boolean {
  if (!onlineManager.isOnline()) return false;
  const now = Date.now();
  const previous = lastRefreshAt.get(showId);
  if (previous !== undefined) {
    if (now - previous < SHOW_OPEN_REFRESH_GAP_MS) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  }
  lastRefreshAt.set(showId, now);
  return true;
}

/** Test seam: forget which shows were refreshed. */
export function resetShowOpenRefreshesForTests(): void {
  lastRefreshAt.clear();
}
