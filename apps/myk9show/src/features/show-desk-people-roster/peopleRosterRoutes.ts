/**
 * Deep link into Show Desk's "People at show" tool (MYK9-826).
 *
 * Entry Management's `mode=day-of` was retired when the page moved to the
 * queue-based cockpit (`entryManagementCockpitParams.ts` has no concept of
 * `mode`), but `getEntryManagementHref({ mode: 'day-of' })` kept being called
 * — landing on the registration review queue, which has no check-in control.
 * The check-in controls a secretary needs already live here, under Show Desk
 * → Tools → People at show (`ShowWorkbenchShowDeskPage.tsx`), so this links
 * there instead of rebuilding a day-of mode Entry Management already
 * abandoned (CLAUDE.md "consolidate, don't duplicate" — a deep link to the
 * existing surface, not a second implementation).
 */

/** Must match the `id` of the "People at show" section in `ShowWorkbenchShowDeskPage.tsx`. */
export const SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID = 'people-at-show';

export function getShowDeskPeopleAtShowHref(input: {
  showId: string;
  /** Pre-selects the roster's "Needs check-in" filter on arrival. */
  filter?: 'needs-check-in';
}): string {
  const params = new URLSearchParams();
  params.set('tool', SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID);
  // A dedicated `rosterFilter` param, distinct from the cockpit's own `filter`
  // (day/in-progress/needs-attention/needs-closeout, see cockpitRoutes.ts):
  // sharing the `filter` key meant `writeCockpitUrlState` treated
  // `needs-check-in` as an invalid cockpit filter and dropped it on the next
  // cockpit URL rewrite, resetting the roster to "All exhibitors" on
  // reopen/refresh (MYK9-825/826).
  if (input.filter) params.set('rosterFilter', input.filter);
  return `/shows/${encodeURIComponent(input.showId)}/show-day?${params.toString()}`;
}
