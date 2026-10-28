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
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href)
      .href;
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
    pending.then(end, end);
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
    const key = appApiRequestKey(request.method(), request.url());
    if (!ledger.seen[key]) return true;
    return (ledger.inFlight[key] ?? 0) > 0;
  });
}

export async function waitForAppApiRequestsToSettle(
  page: Page,
  tracker: AppApiRequestTracker,
  { idleMs = DEFAULT_IDLE_MS, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
): Promise<AppApiRequestSettlement> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const open =
      tracker.pending.size === 0 ? [] : stillPending(tracker.pending, await readFetchLedger(page));
    if (open.length === 0 && Date.now() - tracker.lastActivityAt >= idleMs) {
      return { settled: true, pendingUrls: [] };
    }

    await page.waitForTimeout(Math.min(25, idleMs));
  }

  return {
    settled: false,
    pendingUrls: stillPending(tracker.pending, await readFetchLedger(page)).map(request =>
      request.url()
    ),
  };
}
