import type { Page, Request } from '@playwright/test';

const DEFAULT_IDLE_MS = 100;
const DEFAULT_TIMEOUT_MS = 5000;
/**
 * The longest a main-frame navigation may take to commit before the tracker
 * stops ignoring app API requests. A navigation that never commits and never
 * fails (a 204, a download) would otherwise silence the tracker for good.
 */
export const NAVIGATION_COMMIT_WINDOW_MS = 10_000;

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
  /** What the page's fetch ledger says of each pending URL, in the same order. */
  pendingLedger: string[];
}

/**
 * The page's own record of its app API `fetch` calls, keyed `METHOD url`.
 *
 * MYK9-1467: a request the PAGE cancels (an aborted count query) can end with
 * neither `requestfinished` nor `requestfailed` from Playwright. A Chrome
 * net-log of the stall showed the HEAD sent, then `CANCELLED` 80 ms later, and
 * the tracker still waiting on it 28 s on. The page's fetch promise does end on
 * abort, so this ledger is the authority on whether the page still awaits it.
 */
export interface AppApiFetchLedger {
  /** Keys the page has started at least once since this document loaded. */
  seen: Record<string, true>;
  /** Fetches per key the page is still awaiting. */
  inFlight: Record<string, number>;
}

export const FETCH_LEDGER_GLOBAL = '__myk9AppApiFetchLedger';

export function isAppApiRequest(request: Request) {
  const url = request.url();
  return url.includes('/rest/v1/') || url.includes('/functions/v1/') || url.includes('/auth/v1/');
}

export function appApiRequestKey(method: string, url: string) {
  return `${method.toUpperCase()} ${url}`;
}

/**
 * Runs in the page, before any app script, on every document. Self-contained:
 * Playwright serializes it, so it may not reference anything outside its body.
 */
export function installAppApiFetchLedger(globalName: string) {
  const w = window as unknown as Record<string, unknown> & { fetch: typeof fetch };
  if (w[globalName]) return;
  const ledger = { seen: {} as Record<string, true>, inFlight: {} as Record<string, number> };
  w[globalName] = ledger;
  const original = w.fetch.bind(window);
  w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const parsed = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href
    );
    // The browser never sends a fragment, so Playwright's request URL has none.
    parsed.hash = '';
    const url = parsed.href;
    const isApi =
      url.includes('/rest/v1/') || url.includes('/functions/v1/') || url.includes('/auth/v1/');
    if (!isApi) return original(input, init);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const key = `${method} ${url}`;
    ledger.seen[key] = true;
    ledger.inFlight[key] = (ledger.inFlight[key] ?? 0) + 1;
    const end = () => {
      ledger.inFlight[key] = Math.max(0, (ledger.inFlight[key] ?? 1) - 1);
    };
    const pending = original(input, init);
    // The fetch promise resolves at the response headers, before Playwright's
    // `requestfinished`. Count it done only once a copy of the body has fully
    // arrived (or failed, as an abort mid-body does), so a slow body stays open.
    pending.then(response => {
      let body: Promise<unknown>;
      try {
        body = response.clone().arrayBuffer();
      } catch {
        body = Promise.resolve();
      }
      body.then(end, end);
    }, end);
    return pending;
  };
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

  // Every later document gets the ledger; a page without the API (a unit-test
  // stand-in) keeps the network-event view alone.
  if (typeof page.addInitScript === 'function') {
    void page.addInitScript(installAppApiFetchLedger, FETCH_LEDGER_GLOBAL);
  }

  // MYK9-1467: from a main-frame navigation request until the new document
  // commits, the OUTGOING document still runs, and what it starts dies with it
  // without a `requestfinished` or `requestfailed` (run 40785638617 stranded
  // /exhibitor/entries' reads on /account). The new document cannot fetch before
  // it commits, so every app API request in that window is the old one's.
  let outgoingNavigation: Request | null = null;
  let outgoingNavigationAt = 0;
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
  const awaitingCommit = () => {
    if (outgoingNavigation && Date.now() - outgoingNavigationAt >= NAVIGATION_COMMIT_WINDOW_MS) {
      outgoingNavigation = null;
    }
    return outgoingNavigation !== null;
  };

  page.on('request', request => {
    if (isMainFrameNavigation(request)) {
      outgoingNavigation = request;
      outgoingNavigationAt = Date.now();
      tracker.reset();
      return;
    }
    if (!isAppApiRequest(request) || awaitingCommit()) return;
    tracker.pending.add(request);
    recordActivity();
  });
  page.on('framenavigated', frame => {
    if (typeof page.mainFrame === 'function' && frame === page.mainFrame()) {
      outgoingNavigation = null;
    }
  });
  page.on('requestfinished', request => {
    if (!tracker.pending.delete(request)) return;
    recordActivity();
  });
  page.on('requestfailed', request => {
    // A navigation that fails leaves the old document in place, still tracked.
    if (request === outgoingNavigation) outgoingNavigation = null;
    if (!tracker.pending.delete(request)) return;
    recordActivity();
  });

  return tracker;
}

async function readFetchLedger(page: Page): Promise<AppApiFetchLedger | null> {
  if (typeof page.evaluate !== 'function') return null;
  return page
    .evaluate(
      name => (window as unknown as Record<string, AppApiFetchLedger | undefined>)[name] ?? null,
      FETCH_LEDGER_GLOBAL
    )
    .catch(() => null);
}

/**
 * The requests the page is still waiting on. A request Playwright lists as open
 * counts as done only when the page's ledger saw it start and holds none of that
 * key in flight; a request the ledger never saw (not a page `fetch`) keeps the
 * network-event verdict.
 */
export function stillPending(
  pending: Iterable<Request>,
  ledger: AppApiFetchLedger | null
): Request[] {
  return [...pending].filter(request => {
    if (!ledger) return true;
    // The ledger sees only the page's own `fetch`; a service worker's request
    // with the same key is not one the ledger can vouch for.
    if (request.serviceWorker?.()) return true;
    const key = appApiRequestKey(request.method(), request.url());
    if (!ledger.seen[key]) return true;
    return (ledger.inFlight[key] ?? 0) > 0;
  });
}

/**
 * The ledger's account of one request the tracker still holds open, for the
 * unsettled report: whether the page is still awaiting it, has finished it, or
 * never fetched that exact key (then the page's keys for the same path, so a
 * URL spelling mismatch shows up as such).
 */
export function describeLedgerState(request: Request, ledger: AppApiFetchLedger | null): string {
  if (!ledger) return 'no page ledger';
  const key = appApiRequestKey(request.method(), request.url());
  if (ledger.seen[key]) return `page in flight ${ledger.inFlight[key] ?? 0}`;
  const path = key.split('?')[0].replace(/^\S+ /, '');
  const samePath = Object.keys(ledger.seen)
    .filter(seen => seen.split('?')[0].endsWith(` ${path}`))
    .map(seen => `${seen} (in flight ${ledger.inFlight[seen] ?? 0})`);
  return samePath.length > 0
    ? `page never fetched ${request.method()} at this URL; same path: ${samePath.join(' | ')}`
    : `page never fetched ${request.method()} at this URL; no fetch to this path`;
}

/**
 * Treats the ledger's word that the page has finished a request as that
 * request's completion: it leaves `pending` and restarts the idle window, as a
 * `requestfinished` would. Without the restart, a request open longer than the
 * idle window would let the sweep leave at once, before the reads its
 * completion triggers.
 */
function closeLedgerEndedRequests(tracker: AppApiRequestTracker, ledger: AppApiFetchLedger | null) {
  const open = new Set(stillPending(tracker.pending, ledger));
  for (const request of [...tracker.pending]) {
    if (open.has(request)) continue;
    tracker.pending.delete(request);
    tracker.lastActivityAt = Date.now();
  }
}

export async function waitForAppApiRequestsToSettle(
  page: Page,
  tracker: AppApiRequestTracker,
  { idleMs = DEFAULT_IDLE_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
): Promise<AppApiRequestSettlement> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (tracker.pending.size > 0) closeLedgerEndedRequests(tracker, await readFetchLedger(page));
    if (tracker.pending.size === 0 && Date.now() - tracker.lastActivityAt >= idleMs) {
      return { settled: true, pendingUrls: [], pendingLedger: [] };
    }

    await page.waitForTimeout(Math.min(25, idleMs));
  }

  const ledger = await readFetchLedger(page);
  const open = stillPending(tracker.pending, ledger);
  return {
    settled: false,
    pendingUrls: open.map(request => request.url()),
    pendingLedger: open.map(request => describeLedgerState(request, ledger)),
  };
}
