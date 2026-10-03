import type { PeopleRosterFilter } from './peopleRoster';

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

const PEOPLE_ROSTER_VIEWS: ReadonlySet<string> = new Set(['all', 'needs-check-in', 'online']);

function isPeopleRosterFilter(value: string | null): value is PeopleRosterFilter {
  return value != null && PEOPLE_ROSTER_VIEWS.has(value);
}

/**
 * Normalizes the roster's `?view=` param, defaulting an absent or stale value
 * to `all` — the same "unsupported value never renders an unexplained empty
 * list" contract every other list-toolkit surface's URL state follows.
 */
export function normalizePeopleRosterView(params: URLSearchParams): PeopleRosterFilter {
  const requested = params.get('view');
  return isPeopleRosterFilter(requested) ? requested : 'all';
}

/**
 * Writes the roster's `view` onto the EXISTING params, leaving every other
 * key untouched. Unlike `writeCockpitUrlState` (which rebuilds its params
 * from scratch and must explicitly pass through keys it doesn't own, see
 * `cockpitRoutes.ts`), this clones `previous` — so the cockpit's own
 * `day`/`filter`/`focus`/`anchor`/`tool` state survives a roster view change
 * with no coupling in this direction at all.
 */
export function writePeopleRosterView(
  previous: URLSearchParams,
  view: PeopleRosterFilter
): URLSearchParams {
  const next = new URLSearchParams(previous);
  if (view === 'all') {
    next.delete('view');
  } else {
    next.set('view', view);
  }
  return next;
}

export function getShowDeskPeopleAtShowHref(input: {
  showId: string;
  /** Pre-selects the roster's "Needs check-in" view on arrival. */
  filter?: 'needs-check-in';
}): string {
  const params = new URLSearchParams();
  params.set('tool', SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID);
  // MYK9-812: was a one-way `rosterFilter` param; now the roster's own
  // two-way `view` state (`usePeopleRosterUrlState`), still a key distinct
  // from the cockpit's own `filter` (day/in-progress/needs-attention/needs-
  // closeout, see cockpitRoutes.ts) — sharing that key is exactly what
  // caused `writeCockpitUrlState` to treat `needs-check-in` as an invalid
  // cockpit filter and drop it on the next cockpit URL rewrite, resetting
  // the roster to "All exhibitors" on reopen/refresh (MYK9-825/826).
  if (input.filter) params.set('view', input.filter);
  return `/shows/${encodeURIComponent(input.showId)}?${params.toString()}`;
}
