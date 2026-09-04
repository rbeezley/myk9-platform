import type { Page, Request } from '@playwright/test';

const DEFAULT_IDLE_MS = 100;
const DEFAULT_TIMEOUT_MS = 5000;

export interface AppApiRequestTracker {
  pending: Set<Request>;
  lastActivityAt: number;
  /**
   * Forget everything currently in flight.
   *
   * Call this at a NAVIGATION BOUNDARY. A request whose document is torn down
   * by `page.goto` may never emit `requestfinished` OR `requestfailed`, so it
   * stays in `pending` for the life of the tracker. Since one tracker spans a
   * whole role sweep, a single such request made every LATER route in that
   * sweep fail the settle assertion — reporting the same stranded URLs over
   * and over as though each route were broken.
   *
   * Resets `lastActivityAt` too. Without that, a tracker whose last activity
   * was seconds ago on the previous route already satisfies the idle window,
   * so an empty `pending` would report "settled" before the new route had
   * issued a single request — trading a false failure for a false pass.
   */
  reset(): void;
}

export interface AppApiRequestSettlement {
  settled: boolean;
  pendingUrls: string[];
}

export function isAppApiRequest(request: Request) {
  const url = request.url();
  return url.includes('/rest/v1/') || url.includes('/functions/v1/') || url.includes('/auth/v1/');
}

export function watchAppApiRequests(page: Page) {
  const tracker: AppApiRequestTracker = {
    pending: new Set<Request>(),
    lastActivityAt: Date.now(),
    reset() {
      tracker.pending.clear();
      tracker.lastActivityAt = Date.now();
    },
  };

  const recordActivity = () => {
    tracker.lastActivityAt = Date.now();
  };

  page.on('request', request => {
    if (!isAppApiRequest(request)) return;
    tracker.pending.add(request);
    recordActivity();
  });
  page.on('requestfinished', request => {
    if (!tracker.pending.delete(request)) return;
    recordActivity();
  });
  page.on('requestfailed', request => {
    if (!tracker.pending.delete(request)) return;
    recordActivity();
  });

  return tracker;
}

export async function waitForAppApiRequestsToSettle(
  page: Page,
  tracker: AppApiRequestTracker,
  { idleMs = DEFAULT_IDLE_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
): Promise<AppApiRequestSettlement> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (tracker.pending.size === 0 && Date.now() - tracker.lastActivityAt >= idleMs) {
      return { settled: true, pendingUrls: [] };
    }

    await page.waitForTimeout(Math.min(25, idleMs));
  }

  return {
    settled: false,
    pendingUrls: [...tracker.pending].map(request => request.url()),
  };
}
