/**
 * "We couldn't reach the server to confirm these entries."
 *
 * One component, two placements, because the sentence must be identical in
 * both: inside a show group (beside its withheld money) and above an EMPTY
 * list. The empty case is the one that was missing — an unconfirmed read that
 * returns no rows rendered `FirstRunZeroState`'s "let's get you set up" with
 * nothing saying we had not been able to ask, which is the same false claim
 * about an exhibitor's standing that the money gate exists to prevent, arriving
 * by another route (MYK9-629 round 1).
 *
 * WHY THIS CARRIES ITS OWN RETRY rather than borrowing `EntriesLoadErrorCard`.
 * That card's copy promises "Your saved information is still here", which it
 * can only keep when there IS saved information on screen — its own docblock
 * says the `inline` variant exists for exactly that reason. Over an empty list
 * the promise is false, and this path is not even an error state: `isError` is
 * false and `error` is null, because a successful offline read that returned
 * zero rows is a success (MYK9-629 round 2). So the notice states what actually
 * happened and offers the same action without the claim.
 *
 * @module MyEntriesPage/modules/UnconfirmedReadNotice
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface UnconfirmedReadNoticeProps {
  /** Shown under the headline. Omitted on the empty path, which has no money. */
  detail?: string | undefined;
  /** When given, the notice offers a Retry. The show-group placement does not. */
  onRetry?: (() => void) | undefined;
  /** Spins and disables the Retry while a refresh is in flight. */
  refreshing?: boolean | undefined;
}

export const UNCONFIRMED_READ_HEADLINE =
  "Showing saved entries — we couldn't reach the server to confirm them";

/**
 * The empty-list headline. Deliberately NOT the one above: with no rows on
 * screen there are no "saved entries" to be showing, so saying so would be the
 * same false claim in a different sentence.
 */
export const UNCONFIRMED_EMPTY_HEADLINE = "We couldn't confirm your entries right now";

export const UNCONFIRMED_EMPTY_DETAIL =
  "Anything you've entered will appear once we can reach the server.";

export const UnconfirmedReadNotice: React.FC<
  UnconfirmedReadNoticeProps & { headline?: string | undefined }
> = ({ detail, onRetry, refreshing = false, headline = UNCONFIRMED_READ_HEADLINE }) => (
  // Not `role="status"`: this is standing copy about the read, not a live
  // announcement, and a second status region on a page that already has one
  // makes every `getByRole('status')` ambiguous.
  <div className="myk9-entries-strip border-border bg-muted/40 text-muted-foreground">
    <div className="min-w-0">
      <p className="myk9-entries-strip-head">{headline}</p>
      {detail && <p className="myk9-entries-strip-body">{detail}</p>}
    </div>
    {onRetry && (
      <Button
        variant="outline"
        onClick={onRetry}
        disabled={refreshing}
        className="min-h-[44px] shrink-0"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
        Retry
      </Button>
    )}
  </div>
);
