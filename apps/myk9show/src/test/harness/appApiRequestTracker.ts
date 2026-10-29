import type { Page, Request } from '@playwright/test';

const DEFAULT_IDLE_MS = 100;
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * What the page did with one app API request, kept for the life of the tracker
 * (MYK9-1477). `reset()` and the settle check forget in-flight requests; this
 * does not, so a WebKit page error can be traced back to a request this page
 * itself cancelled.
 */
export interface AppApiRequestLedgerEntry {
  url: string;
  outcome: 'pending' | 'finished' | 'failed';
  /** Playwright's `request.failure().errorText`, when the request failed. */
  failureText: string | null;
  /**
   * Still in flight when a navigation boundary (`reset()`, or the commit of a
   * cross-document navigation) arrived: the outgoing document started it and
   * its teardown cancelled it.
   */
  orphanedByNavigation: boolean;
  /**
   * Can no longer excuse a page error: it already excused one, or it had settled
   * before a route's health check ran (MYK9-1477, Codex round 1).
   */
  spent: boolean;
}

export interface AppApiRequestTracker {
  pending: Set<Request>;
  lastActivityAt: number;
  ledger: AppApiRequestLedgerEntry[];
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

function withoutHash(url: string) {
  const at = url.indexOf('#');
  return at === -1 ? url : url.slice(0, at);
}

export function watchAppApiRequests(page: Page) {
  const tracker: AppApiRequestTracker = {
    pending: new Set<Request>(),
    lastActivityAt: Date.now(),
    ledger: [],
    reset() {
      for (const request of tracker.pending) {
        const entry = entries.get(request);
        if (entry) entry.orphanedByNavigation = true;
      }
      tracker.pending.clear();
      tracker.lastActivityAt = Date.now();
    },
  };

  const entries = new Map<Request, AppApiRequestLedgerEntry>();

  const recordActivity = () => {
    tracker.lastActivityAt = Date.now();
  };

  // MYK9-1467: from a main-frame navigation request until the new document
  // commits, the OUTGOING document still runs, and what it starts dies with it
  // without a `requestfinished` or `requestfailed` (run 40785638617 stranded
  // /exhibitor/entries' reads on /account). Everything stays tracked until the
  // navigation COMMITS; only then, when the old document is gone and the new one
  // has not yet run a line, is all of pending the old document's and dropped. A
  // navigation that fails or never commits (a 204, a download) clears nothing,
  // so it can only cost a false failure, never a false pass. The commit is the
  // main frame arriving at the navigation request's own URL, so a same-document
  // `framenavigated` (pushState) elsewhere clears nothing either.
  let crossDocumentNavigation: Request | null = null;
  const isMainFrameNavigation = (request: Request) => {
    if (request.isNavigationRequest?.() !== true || typeof page.mainFrame !== 'function') {
      return false;
    }
    try {
      return request.frame?.() === page.mainFrame();
    } catch {
      return false; // A service worker's request has no frame.
    }
  };

  page.on('request', request => {
    if (isMainFrameNavigation(request)) {
      crossDocumentNavigation = request;
      return;
    }
    if (!isAppApiRequest(request)) return;
    const entry: AppApiRequestLedgerEntry = {
      url: request.url(),
      outcome: 'pending',
      failureText: null,
      orphanedByNavigation: false,
      spent: false,
    };
    entries.set(request, entry);
    tracker.ledger.push(entry);
    tracker.pending.add(request);
    recordActivity();
  });
  page.on('framenavigated', frame => {
    if (!crossDocumentNavigation) return;
    if (typeof page.mainFrame !== 'function' || frame !== page.mainFrame()) return;
    if (withoutHash(frame.url()) !== withoutHash(crossDocumentNavigation.url())) return;
    crossDocumentNavigation = null;
    tracker.reset();
  });
  page.on('requestfinished', request => {
    const entry = entries.get(request);
    if (entry) entry.outcome = 'finished';
    if (!tracker.pending.delete(request)) return;
    recordActivity();
  });
  page.on('requestfailed', request => {
    const entry = entries.get(request);
    if (entry) {
      entry.outcome = 'failed';
      entry.failureText = request.failure?.()?.errorText ?? '';
    }
    if (request === crossDocumentNavigation) crossDocumentNavigation = null;
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
