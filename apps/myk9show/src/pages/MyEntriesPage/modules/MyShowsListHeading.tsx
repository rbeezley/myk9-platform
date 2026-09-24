/**
 * The "All entries" heading above the My Shows filters and list.
 *
 * A real heading, not a styled <p>: this and "My Dogs" were the page's two
 * section labels and neither was reachable by heading navigation, so a
 * screen-reader user had exactly one landmark (the h1) for the whole surface.
 *
 * It is also the always-mounted focus FALLBACK after leaving a class
 * (MYK9-658): when a filter removes the dog card the exhibitor just left a
 * class from, the card's own anchor is gone and focus would drop to `<body>`.
 * Programmatically focusable only (`tabIndex={-1}`); `dogCardAnchor.ts` owns
 * the id so the dialog and this heading cannot disagree about it.
 *
 * @module MyEntriesPage/modules/MyShowsListHeading
 */

import React from 'react';
import { MY_SHOWS_LIST_HEADING_ID } from './dogCardAnchor';
import { ALL_ENTRIES_LABEL, ALL_ENTRIES_SCOPE_NOTE } from './myShowsCopy';

export const MyShowsListHeading: React.FC = () => (
  <h2
    id={MY_SHOWS_LIST_HEADING_ID}
    tabIndex={-1}
    className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex flex-wrap items-center gap-2 focus:outline-none"
  >
    {ALL_ENTRIES_LABEL}
    {/* The count badge that used to sit here is gone. The "All" chip
        immediately below carries it — and carries it SCOPED to the active
        status filter, so the two disagreed on sight: this badge read 190 while
        the chip read 187. What survives is the part the chips cannot say: the
        unit these numbers count, and that past shows are included. */}
    <span className="normal-case tracking-normal font-normal text-muted-foreground">
      {ALL_ENTRIES_SCOPE_NOTE}
    </span>
  </h2>
);
