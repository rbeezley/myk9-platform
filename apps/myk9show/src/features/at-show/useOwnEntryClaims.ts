import { useMemo } from 'react';
import type { Entry } from '@myk9/ringside';
import type { ClaimState } from '@myk9/ringside/run-queue';
import { useMyEntryQueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';
import { useShowRingRows } from './useMyRingConflicts';

const NO_CLAIMS: ReadonlyMap<string, ClaimState> = new Map();

/**
 * The claim state of each of the exhibitor's own entries on the entry list (MYK9-1970): the
 * server's answer (`get_my_entry_queue_places`, MYK9-1969) when one has landed, else `paper`
 * from the class row this device holds, so a phone that already has the class shows the paper
 * line offline. The list's client count never decides this itself.
 */
export function useOwnEntryClaims(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>,
  entries: readonly Entry[]
): ReadonlyMap<string, ClaimState> {
  const ids = useMemo(() => [...ownEntryIds], [ownEntryIds]);
  const places = useMyEntryQueuePlaces(ids);
  const { data } = useShowRingRows(showId, !!showId && ownEntryIds.size > 0);

  return useMemo(() => {
    if (ownEntryIds.size === 0) return NO_CLAIMS;
    const paperClassIds = new Set(
      (data?.classes ?? []).filter(cls => cls.onPaper).map(cls => cls.classId)
    );
    const claims = new Map<string, ClaimState>();
    for (const entry of entries) {
      if (!ownEntryIds.has(entry.id)) continue;
      const answer = places.get(entry.id);
      if (answer) claims.set(entry.id, answer.claimState);
      else if (paperClassIds.has(entry.classId)) claims.set(entry.id, 'paper');
    }
    return claims;
  }, [ownEntryIds, entries, places, data]);
}
