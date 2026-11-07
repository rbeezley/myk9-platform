import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  getFlaggedPullSources,
  type FlaggedPullSource,
} from '@/services/database/entries/flaggedPull';

const NONE: ReadonlyMap<string, FlaggedPullSource> = new Map();

/**
 * Who flagged each pulled class on the desk (MYK9-1753). Keyed on the flagged entry ids the desk
 * already shows, so a new flag from ringside or an exhibitor is looked up as soon as it syncs. Only
 * asks when something is flagged; a failed or offline read leaves the source unknown, never wrong.
 */
export function useFlaggedPullSources(
  showId: string,
  flaggedEntryIds: readonly string[]
): ReadonlyMap<string, FlaggedPullSource> {
  // The ids only decide when to re-read; the read itself returns the whole show's flags.
  const key = [...flaggedEntryIds].sort().join(',');
  const { data } = useQuery({
    queryKey: ['check-in-desk', 'flagged-pull-sources', showId, key],
    queryFn: () => getFlaggedPullSources(showId),
    enabled: key.length > 0,
    staleTime: 30_000,
    // A new or cleared flag changes the key; keep the sources already known while it re-reads.
    placeholderData: keepPreviousData,
  });
  return data ?? NONE;
}
