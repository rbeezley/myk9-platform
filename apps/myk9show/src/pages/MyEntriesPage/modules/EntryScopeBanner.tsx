/**
 * Explains a narrowed My Shows list, and offers the way back out of it.
 *
 * My Payments' per-row "Receipt" link arrives with `?showId=&entryIds=`, which
 * narrows the list to that one order. A silently short list is worse than the
 * unfiltered one it replaced — an exhibitor who came here from a payment would
 * read "1 entry" as "the rest are gone". So the filter always announces itself
 * and always offers one click back to everything.
 *
 * @module MyEntriesPage/modules/EntryScopeBanner
 */

import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EntryScopeMatch } from './entryScopeFilter';
import type { MyEntry } from './my-entries-types';

interface EntryScopeBannerProps {
  scopeMatch: EntryScopeMatch;
  /** The exhibitor's FULL entry list, for the "N of M" denominator. */
  totalEntries: MyEntry[];
  onClearScope: () => void;
}

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
 * on screen. The 'show' fallback in particular must not borrow the 'entries'
 * sentence: it is listing the whole show precisely BECAUSE the named entry rows
 * were not found, so calling those "the ones your payment covered" would be the
 * same false promise the bare "Receipt" label used to make, one screen along.
 */
export function buildScopeMessage(scopeMatch: EntryScopeMatch, totalCount: number): string | null {
  if (scopeMatch.kind === 'none') return null;
  if (scopeMatch.kind === 'unmatched') {
    return 'That receipt link no longer matches any of your entries, so all of them are shown below.';
  }

  const shown = scopeMatch.entries.length;
  const count = `${shown} of ${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}`;
  const showName = scopedShowName(scopeMatch.entries);

  if (scopeMatch.kind === 'show') {
    const where = showName ? ` for ${showName}` : ' for one show';
    return `Showing ${count}${where} — we could not pin down which of them that payment covered.`;
  }
  return showName
    ? `Showing ${count} — the ones your payment for ${showName} covered.`
    : `Showing ${count} from one payment.`;
}

export function EntryScopeBanner({
  scopeMatch,
  totalEntries,
  onClearScope,
}: EntryScopeBannerProps) {
  const message = buildScopeMessage(scopeMatch, totalEntries.length);
  if (!message) return null;

  return (
    <div
      role="status"
      // bg-muted, not bg-muted/50 — opacity modifiers on var()-backed tokens
      // do not compile here; see tokenOpacityContract.test.ts.
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm text-foreground">
        <Filter className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {message}
      </p>
      {/* Rendered even in the unmatched case: the params are still in the URL,
        so refresh and back/forward would keep replaying this banner until
        something clears them. */}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 self-start sm:self-auto"
        onClick={onClearScope}
      >
        Show all entries
      </Button>
    </div>
  );
}
