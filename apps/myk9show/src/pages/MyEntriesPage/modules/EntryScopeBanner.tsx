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
 * The show the scope belongs to, when every scoped entry agrees on one. A
 * cross-show order is not a thing the checkout can produce, but the list is
 * grouped data — deriving rather than asserting keeps the copy honest if that
 * ever changes.
 */
function scopedShowName(entries: MyEntry[]): string | null {
  if (entries.length === 0) return null;
  const first = entries[0].showName;
  return entries.every(entry => entry.showName === first) ? first : null;
}

export function EntryScopeBanner({
  scopeMatch,
  totalEntries,
  onClearScope,
}: EntryScopeBannerProps) {
  if (scopeMatch.kind === 'none') return null;

  const unmatched = scopeMatch.kind === 'unmatched';
  const showName = unmatched ? null : scopedShowName(scopeMatch.entries);
  const shown = scopeMatch.entries.length;
  const total = totalEntries.length;

  // Say what happened, not what the URL said. "Showing 1 of 12" is the fact an
  // exhibitor needs; the entry ids that produced it are not.
  const message = unmatched
    ? 'That receipt link no longer matches any of your entries, so all of them are shown below.'
    : showName
      ? `Showing ${shown} of ${total} ${total === 1 ? 'entry' : 'entries'} — the ones your payment for ${showName} covered.`
      : `Showing ${shown} of ${total} ${total === 1 ? 'entry' : 'entries'} from one payment.`;

  return (
    <div
      role="status"
      // bg-muted, not bg-muted/50: opacity modifiers on var()-backed tokens do
      // not compile here, so the /50 variant paints nothing at all (see
      // tokenOpacityContract). Full --muted differs from --background in both
      // themes (#f0eee6 vs #faf7f2 light, #1e1c19 vs #181411 dark), so the
      // strip reads as a distinct surface without a decorative tint.
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
