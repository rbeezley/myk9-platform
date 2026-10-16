/**
 * The Clubs list's filters as a query string (`?search=…`, or empty), for links that leave the
 * list mounted: a row opened from it, and the open club's Close. The filters live in the URL
 * (`useBrowseClubsData`), so a link without them clears the list's search. Only the filters are
 * carried, never `returnTo` or `create`.
 */
export function clubsFilterQuery(search: string): string {
  return search ? `?${new URLSearchParams({ search }).toString()}` : '';
}
