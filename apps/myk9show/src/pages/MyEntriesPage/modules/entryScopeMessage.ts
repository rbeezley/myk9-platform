/**
 * The exhibitor-facing sentence for one resolved entry scope.
 *
 * Lives beside `EntryScopeBanner` rather than inside it so it can be unit
 * tested without rendering — every branch here is a factual claim about what
 * is on screen, and those are exactly the claims worth pinning down.
 *
 * @module MyEntriesPage/modules/entryScopeMessage
 */

import type { EntryScopeMatch } from './entryScopeFilter';
import type { MyEntry } from './my-entries-types';

/**
 * The show the scope belongs to, when every scoped entry agrees on one — else
 * null, and the copy drops the name rather than naming the wrong show. A
 * cross-show order is not a thing the checkout can produce today; deriving
 * rather than asserting keeps the copy honest if that ever changes.
 */
function scopedShowName(entries: MyEntry[]): string | null {
  if (entries.length === 0) return null;
  const first = entries[0].showName;
  return entries.every(entry => entry.showName === first) ? first : null;
}

/**
 * The sentence for one resolved scope. Each branch describes what is ACTUALLY
 * on screen, and only 'entries' — every named row found — may claim these are
 * what the payment covered. The 'show' and 'partial' branches must not borrow
 * that sentence: one is listing a whole show because the named rows were not
 * found, the other is missing some of them. Either would be the same false
 * promise the bare "Receipt" label used to make, moved one screen along.
 */
export function buildScopeMessage(scopeMatch: EntryScopeMatch, totalCount: number): string | null {
  if (scopeMatch.kind === 'none') return null;
  if (scopeMatch.kind === 'unmatched') {
    // Deliberately NOT "that link no longer matches" — this state is also
    // reachable transiently while the order's rows are still replicating, and
    // asserting finality from a timing signal is the same overclaim the
    // 'show' and 'partial' branches hedge against.
    return 'We could not find the entries from that payment, so all of yours are shown below.';
  }

  const shown = scopeMatch.entries.length;
  const count = `${shown} of ${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`;
  const showName = scopedShowName(scopeMatch.entries);

  if (scopeMatch.kind === 'show') {
    const where = showName ? ` for ${showName}` : ' for one show';
    return `Showing ${count}${where} — we could not pin down which of them that payment covered.`;
  }
  if (scopeMatch.kind === 'partial') {
    // Some named rows are missing (still replicating, or since withdrawn), so
    // this must not say "the ones your payment covered".
    const where = showName ? ` for ${showName}` : '';
    return `Showing ${count}${where}. We could not find every entry that payment covered — some may still be syncing.`;
  }
  return showName
    ? `Showing ${count} — the ones your payment for ${showName} covered.`
    : `Showing ${count} from one payment.`;
}
