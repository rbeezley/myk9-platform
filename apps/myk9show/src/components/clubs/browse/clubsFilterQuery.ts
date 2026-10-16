import { filtersQueryString } from '@/hooks/urlFilters';

const DEFAULT_CLUB_FILTERS = { search: '' };

/**
 * The Clubs list's filters as a query string (`?search=…`, or empty), for links that leave the
 * list mounted: a row opened from it, and the open club's Close. See `filtersQueryString`.
 */
export function clubsFilterQuery(search: string): string {
  return filtersQueryString({ search }, DEFAULT_CLUB_FILTERS);
}
