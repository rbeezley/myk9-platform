import type { AppApiRequestLedgerEntry } from './appApiRequestTracker';

/**
 * WebKit reports a cross-origin fetch that was CANCELLED as a page error
 * ("<url> due to access control checks"), even when the server would have
 * answered 200 (MYK9-244, MYK9-1467, MYK9-1477). A real CORS fault produces the
 * same sentence, so the sentence alone proves nothing. A page error is excused
 * only when this page's own request ledger shows that exact URL was cancelled
 * by the page (a `requestfailed` abort/cancel, e.g. React Query dropping a
 * query on a key change) or was still in flight when a navigation boundary
 * tore its document down. Each ledger entry excuses ONE error (it is marked
 * spent), and `retireSettledLedgerEntries` spends every settled entry after a
 * route's check, so a cancellation on one route never excuses a later route's
 * genuine failure of the same URL.
 */
const ACCESS_CONTROL_PATTERN = /(\S+) due to access control checks/;
const CANCELLED_PATTERN = /cancel|abort/i;

function withoutScheme(url: string) {
  return url.replace(/^(?:https?:)?\/*/, '');
}

export function accessControlErrorUrl(message: string): string | null {
  const match = ACCESS_CONTROL_PATTERN.exec(message);
  return match ? withoutScheme(match[1]) : null;
}

function wasCancelledByPage(entry: AppApiRequestLedgerEntry) {
  // Orphaned counts only while no other outcome arrived: a request that later
  // failed for any reason but a cancel is a real failure.
  if (entry.orphanedByNavigation && entry.outcome === 'pending') return true;
  return entry.outcome === 'failed' && CANCELLED_PATTERN.test(entry.failureText ?? '');
}

/**
 * Call after each route's health check. A request that settled before or during
 * that route has had its one chance to excuse an error; only requests still in
 * flight (which the next navigation may cancel) stay eligible.
 */
export function retireSettledLedgerEntries(ledger: readonly AppApiRequestLedgerEntry[]) {
  for (const entry of ledger) {
    if (entry.outcome !== 'pending') entry.spent = true;
  }
}

export interface CancelledFetchPartition {
  kept: string[];
  ignored: string[];
}

export function partitionCancelledWebkitFetchErrors(
  pageErrors: readonly string[],
  /** Entries that excuse an error are marked spent. */
  ledger: readonly AppApiRequestLedgerEntry[],
  browserName: string
): CancelledFetchPartition {
  if (browserName !== 'webkit') return { kept: [...pageErrors], ignored: [] };

  const kept: string[] = [];
  const ignored: string[] = [];
  for (const message of pageErrors) {
    const url = accessControlErrorUrl(message);
    const match =
      url === null
        ? undefined
        : ledger.find(
            entry => !entry.spent && wasCancelledByPage(entry) && withoutScheme(entry.url) === url
          );
    if (match) {
      match.spent = true;
      ignored.push(message);
    } else {
      kept.push(message);
    }
  }
  return { kept, ignored };
}
