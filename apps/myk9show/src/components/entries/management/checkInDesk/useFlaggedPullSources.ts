import { useQuery } from '@tanstack/react-query';
import {
  getFlaggedPullSources,
  type FlaggedPullSource,
} from '@/services/database/entries/flaggedPull';

const NONE: ReadonlyMap<string, FlaggedPullSource> = new Map();

/**
 * Who flagged each pulled class on the desk (MYK9-1753). Keyed on the flags the desk already shows
 * (entry id plus its last write time), so each new flag, even a second one on the same class, gets
 * its own read as soon as it syncs. Only asks when something is flagged; a failed or offline read
 * leaves the source unknown, never wrong.
 */
export function useFlaggedPullSources(
  showId: string,
  /** One `<entryId>@<last write time>` per flagged class. */
  flagKeys: readonly string[]
): ReadonlyMap<string, FlaggedPullSource> {
  // The keys only decide when to re-read; the read itself returns the whole show's flags.
  const key = [...flagKeys].sort().join(',');
  const { data } = useQuery({
    queryKey: ['check-in-desk', 'flagged-pull-sources', showId, key],
    queryFn: () => getFlaggedPullSources(showId),
    enabled: key.length > 0,
    // A flag can be cleared and set again by someone else, so a source is only shown from a read
    // made for the current flags, never a cached one that would credit the new flag to the old
    // flagger (Codex, PR #3698). Until the read lands the card says "Flagged as pulled."
    staleTime: 0,
    gcTime: 0,
  });
  return data ?? NONE;
}
