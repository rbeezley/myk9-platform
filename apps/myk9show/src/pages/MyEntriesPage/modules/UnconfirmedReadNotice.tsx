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
 * @module MyEntriesPage/modules/UnconfirmedReadNotice
 */

import React from 'react';

export interface UnconfirmedReadNoticeProps {
  /** Shown under the headline. Omitted on the empty path, which has no money. */
  detail?: string | undefined;
}

export const UNCONFIRMED_READ_HEADLINE =
  "Showing saved entries — we couldn't reach the server to confirm them";

export const UnconfirmedReadNotice: React.FC<UnconfirmedReadNoticeProps> = ({ detail }) => (
  // Not `role="status"`: this is standing copy about the read, not a live
  // announcement, and a second status region on a page that already has one
  // makes every `getByRole('status')` ambiguous.
  <div className="myk9-entries-strip border-border bg-muted/40 text-muted-foreground">
    <div className="min-w-0">
      <p className="myk9-entries-strip-head">{UNCONFIRMED_READ_HEADLINE}</p>
      {detail && <p className="myk9-entries-strip-body">{detail}</p>}
    </div>
  </div>
);
