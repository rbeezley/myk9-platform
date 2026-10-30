/**
 * URL-backed filters for a show's Stats and Results tabs (MYK9-1512). One hook for both so
 * `trial`, `element` and `level` mean the same thing wherever they are set, and a filtered view
 * is a link. Values are read raw; a stale link is shown (and clearable) by the filter menu
 * rather than silently dropped.
 */
import { useCallback, useMemo } from 'react';
import { useListUrlParams } from '@/hooks/useListUrlParams';
import {
  EMPTY_SHOW_STATS_FILTERS,
  SHOW_STATS_FILTER_KEYS,
  type ShowStatsFilterKey,
  type ShowStatsFilters,
} from '@/components/analytics/analytics-filters';

export function useShowStatsFilters() {
  const { searchParams, patch } = useListUrlParams();

  const filters = useMemo<ShowStatsFilters>(() => {
    const next = { ...EMPTY_SHOW_STATS_FILTERS };
    for (const key of SHOW_STATS_FILTER_KEYS) next[key] = searchParams.get(key) || null;
    return next;
  }, [searchParams]);

  const setFilter = useCallback(
    (key: ShowStatsFilterKey, value: string | null) => patch({ [key]: value }),
    [patch]
  );

  const clearFilters = useCallback(
    (keys: readonly ShowStatsFilterKey[] = SHOW_STATS_FILTER_KEYS) =>
      patch(Object.fromEntries(keys.map(key => [key, null]))),
    [patch]
  );

  return { filters, setFilter, clearFilters };
}
