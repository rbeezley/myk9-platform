/**
 * The focus anchor for one rendered My Shows dog card (MYK9-658).
 *
 * Keyed on `MyShowDog.id` — the first merged class row's `entries.id` — which
 * is unique per rendered CARD, never on `dogId`: dogs merge by `dogId` inside a
 * show group and the page renders every group at once, so one dog entered in
 * two shows would produce two elements with one id, and `getElementById` would
 * send focus into the wrong show.
 *
 * @module MyEntriesPage/modules/dogCardAnchor
 */

/**
 * DOM id of the always-mounted "All entries" heading: where focus goes after a
 * leave when a filter has removed the card itself (`MyShowsListHeading`).
 */
export const MY_SHOWS_LIST_HEADING_ID = 'my-shows-list-heading';

/** DOM id of the dog card's focus anchor (its name). */
export function dogCardAnchorId(dogCardId: string): string {
  return `my-show-dog-card-${dogCardId}`;
}

/** Focus has nowhere to be: on `<body>`, or on a node the refresh removed. */
function isFocusLost(): boolean {
  const active = document.activeElement;
  return active == null || active === document.body || !active.isConnected;
}

/**
 * After a leave's refresh, put focus back somewhere deliberate — but only if
 * it was lost. The card's anchor when it survived the refresh, else the
 * always-mounted list heading; never `<body>`, and never focus the exhibitor
 * has already moved elsewhere.
 *
 * Two animation frames, so React has committed the refreshed list (and
 * unmounted a card a filter no longer admits) before the check runs. No
 * effect and no state: this reads the DOM once and writes focus once.
 */
export function settleFocusAfterLeave(anchorId: string): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!isFocusLost()) return;
      const target =
        document.getElementById(anchorId) ?? document.getElementById(MY_SHOWS_LIST_HEADING_ID);
      target?.focus();
    })
  );
}
