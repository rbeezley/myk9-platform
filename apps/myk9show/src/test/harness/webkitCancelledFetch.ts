import type { AppApiRequestLedgerEntry } from './appApiRequestTracker';

/**
 * WebKit reports a cross-origin fetch that was CANCELLED as a page error
 * ("<url> due to access control checks"), even when the server would have
 * answered 200 (MYK9-244, MYK9-1467, MYK9-1477). A real CORS fault produces the
 * same sentence, so the sentence alone proves nothing. A page error is excused
 * only when this page's own request ledger shows that exact URL was cancelled
 * by the page (a `requestfailed` abort/cancel, e.g. React Query dropping a
 * query on a key change) or was still in flight when a navigation boundary
 * tore its document down. Each ledger entry excuses ONE error, so a later,
 * genuine failure of the same URL still fails.
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
  if (entry.orphanedByNavigation && entry.outcome !== 'finished') return true;
  return entry.outcome === 'failed' && CANCELLED_PATTERN.test(entry.failureText ?? '');
}

export interface CancelledFetchPartition {
  kept: string[];
  ignored: string[];
}

export function partitionCancelledWebkitFetchErrors(
  pageErrors: readonly string[],
  ledger: readonly AppApiRequestLedgerEntry[],
  browserName: string
): CancelledFetchPartition {
  if (browserName !== 'webkit') return { kept: [...pageErrors], ignored: [] };

  const available = ledger.filter(wasCancelledByPage).map(entry => withoutScheme(entry.url));
  const kept: string[] = [];
  const ignored: string[] = [];
  for (const message of pageErrors) {
    const url = accessControlErrorUrl(message);
    const at = url === null ? -1 : available.indexOf(url);
    if (at === -1) {
      kept.push(message);
    } else {
      available.splice(at, 1);
      ignored.push(message);
    }
  }
  return { kept, ignored };
}
