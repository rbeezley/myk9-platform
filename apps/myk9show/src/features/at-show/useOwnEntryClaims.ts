import { useMemo } from 'react';
import { resolveClaim, type ClaimState } from '@myk9/ringside/run-queue';
import { useMyEntryQueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';
import { useShowRingRows } from './useShowRingRows';

const NO_CLAIMS: ReadonlyMap<string, ClaimState> = new Map();

/**
 * The claim state of each of the exhibitor's own entries (MYK9-1970): the server's answer
 * (`get_my_entry_queue_places`, MYK9-1969) when one has landed, else the shared fallback
 * `resolveClaim`: paper from the class this device holds (or the show's switch), else stale.
 * Offline, while loading or after a failed read an entry is therefore never a live count.
 */
export function useOwnEntryClaims(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>,
  entries: readonly { id: string; classId?: string | undefined }[]
): ReadonlyMap<string, ClaimState> {
  const ids = useMemo(() => [...ownEntryIds], [ownEntryIds]);
  const places = useMyEntryQueuePlaces(ids);
  const { data } = useShowRingRows(showId, !!showId && ownEntryIds.size > 0);

  return useMemo(() => {
    if (ownEntryIds.size === 0) return NO_CLAIMS;
    const paperFlagByClassId = new Map(
      (data?.classes ?? []).map(cls => [cls.classId, cls.scoresOnPaper])
    );
    const claims = new Map<string, ClaimState>();
    for (const entry of entries) {
      if (!ownEntryIds.has(entry.id)) continue;
      claims.set(
        entry.id,
        resolveClaim({
          server: places.get(entry.id)?.claimState,
          classOnPaper: entry.classId ? paperFlagByClassId.get(entry.classId) : undefined,
          showUsesDeviceScoring: data?.usesDeviceScoring,
        })
      );
    }
    return claims;
  }, [ownEntryIds, entries, places, data]);
}
