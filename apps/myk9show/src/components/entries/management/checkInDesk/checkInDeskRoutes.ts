import { getEntryListHref } from '../entryManagementViews';
import { CHECK_IN_FILTER_PARAM, CHECK_IN_PENDING_VALUE } from './checkInDeskModel';

/**
 * Links into Entry Forms' Check-in desk (MYK9-1690). The desk is the one list of exhibitors and
 * their check-in state; the Overview chip and the retired "People at show" tool link here rather
 * than keep a second roster.
 */
export function getCheckInDeskHref(input: { showId: string; notCheckedIn?: boolean }): string {
  const base = getEntryListHref(input.showId, 'check-in');
  return input.notCheckedIn ? `${base}&${CHECK_IN_FILTER_PARAM}=${CHECK_IN_PENDING_VALUE}` : base;
}

/** The retired Show Desk tool's id: old `?tool=people-at-show` links still resolve to the desk. */
export const RETIRED_PEOPLE_AT_SHOW_TOOL_ID = 'people-at-show';

/**
 * Where an old `?tool=people-at-show[&view=needs-check-in]` link lands, or null for any other
 * Show Desk URL.
 */
export function getRetiredPeopleAtShowRedirect(
  showId: string,
  params: URLSearchParams
): string | null {
  if (params.get('tool') !== RETIRED_PEOPLE_AT_SHOW_TOOL_ID) return null;
  return getCheckInDeskHref({ showId, notCheckedIn: params.get('view') === 'needs-check-in' });
}
