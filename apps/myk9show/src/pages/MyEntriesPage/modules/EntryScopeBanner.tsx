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
import { buildScopeMessage } from './entryScopeMessage';

interface EntryScopeBannerProps {
  scopeMatch: EntryScopeMatch;
  /** How many entries the exhibitor has in total — the "N of M" denominator. */
  totalCount: number;
  onClearScope: () => void;
}

export function EntryScopeBanner({ scopeMatch, totalCount, onClearScope }: EntryScopeBannerProps) {
  const message = buildScopeMessage(scopeMatch, totalCount);
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
