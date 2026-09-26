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
 *
 * Deliberately does NOT also pre-select the roster's "Needs check-in" filter:
 * `writeCockpitUrlState` (`cockpitRoutes.ts`) rebuilds the query string from
 * scratch on every cockpit interaction and only preserves `tool`, so a filter
 * param would silently vanish on the next state write. Landing on "All
 * exhibitors" also sidesteps a mismatch this signal already has with the
 * roster's day-of eligibility rule: `countEntriesWaitingCheckIn` counts
 * accepted-not-checked-in entries across every trial, not just today's, so a
 * pre-filtered "Needs check-in" view could show nothing for a truthful count.
 */

/** Must match the `id` of the "People at show" section in `ShowWorkbenchShowDeskPage.tsx`. */
export const SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID = 'people-at-show';

export function getShowDeskPeopleAtShowHref(input: { showId: string }): string {
  const params = new URLSearchParams();
  params.set('tool', SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID);
  return `/shows/${encodeURIComponent(input.showId)}/show-day?${params.toString()}`;
}
