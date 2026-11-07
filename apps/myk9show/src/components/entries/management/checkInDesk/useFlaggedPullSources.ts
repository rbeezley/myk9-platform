import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getFlaggedPullSources,
  sourceForFlag,
  type FlaggedPullSource,
} from '@/services/database/entries/flaggedPull';

/** A flagged class the desk shows: its entry id and the write time the desk has for it (ms). */
export interface ShownFlag {
  entryId: string;
  writtenAt: number;
}

/**
 * Who flagged each pulled class on the desk (MYK9-1753), by entry id. The read is re-asked whenever
 * the shown flags change, but correctness never rests on the cache: a source is returned only when
 * it was read for the same write the desk is showing (`sourceForFlag`). So a flag cleared and set
 * again by someone else is never credited to the earlier flagger, whatever React Query keeps or
 * shows meanwhile. Unknown, offline or not yet read: no source, and the card says so.
 */
export function useFlaggedPullSources(
  showId: string,
  flags: readonly ShownFlag[]
): ReadonlyMap<string, FlaggedPullSource> {
  const key = flags
    .map(flag => `${flag.entryId}@${flag.writtenAt}`)
    .sort()
    .join(',');
  const { data } = useQuery({
    queryKey: ['check-in-desk', 'flagged-pull-sources', showId, key],
    queryFn: () => getFlaggedPullSources(showId),
    enabled: key.length > 0,
    staleTime: 0,
  });
  return useMemo(() => {
    const shown = new Map<string, FlaggedPullSource>();
    if (!data) return shown;
    for (const flag of flags) {
      const source = sourceForFlag(data, flag.entryId, flag.writtenAt);
      if (source) shown.set(flag.entryId, source);
    }
    return shown;
  }, [data, flags]);
}
