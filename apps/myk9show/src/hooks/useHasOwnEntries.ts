/**
 * Whether the signed-in viewer has an entry of their own, any show, past or upcoming.
 *
 * It answers the rail's My Entries item for staff who are also exhibitors, and it reads only the
 * entries replica (no network). Unknown is not "none": the replica is per show, and identity can
 * be unresolved on a cold offline boot, so `'no'` needs a resolved identity AND a finished
 * replica read that found nothing, with no checkout marker. Everything else holds the last
 * answer remembered on this device, or reports `'unknown'` and the caller keeps the item.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { deriveEntriesIdentityState } from '@/pages/MyEntriesPage/modules/entriesIdentityState';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { readOwnReplicaEntries } from '@/services/database/entries/ownReplicaEntries';
import {
  clearJustEntered,
  hasJustEntered,
  readOwnEntriesMemory,
  writeOwnEntriesMemory,
} from '@/features/own-entries/ownEntriesMemory';

export type OwnEntriesState = 'yes' | 'no' | 'unknown';

const queryKeyFor = (personId: string | null) => ['own-entries', 'replica-has-any', personId];

export function useHasOwnEntries(): OwnEntriesState {
  const { user, loading, personIdentityState } = useAuthContext();
  const personId = useEntriesPersonId();
  const queryClient = useQueryClient();
  const identityState = deriveEntriesIdentityState({
    authLoading: loading,
    hasUser: !!user,
    personId,
    personIdentityState,
  });

  const { data: replicaHasEntries } = useQuery({
    queryKey: queryKeyFor(personId),
    queryFn: async () => (await readOwnReplicaEntries(personId as string)).length > 0,
    enabled: !!personId,
    staleTime: 30_000,
    retry: false,
    // Account-scoped: never answer for the previous account while this one reads.
    placeholderData: () => undefined,
    // A replica read, so it must run offline; the default 'online' mode would park it.
    networkMode: 'always' as const,
  });

  // A sync or a local write can add the first entry while the app is open.
  useEffect(() => {
    if (!personId) return;
    return replicatedEntriesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeyFor(personId) }),
      { emitCurrent: false }
    );
  }, [personId, queryClient]);

  const justEntered = hasJustEntered();
  const answer: OwnEntriesState =
    replicaHasEntries === true || justEntered
      ? 'yes'
      : identityState === 'missing'
        ? 'no'
        : identityState === 'resolved' && replicaHasEntries === false
          ? 'no'
          : 'unknown';

  useEffect(() => {
    if (!personId || answer === 'unknown') return;
    writeOwnEntriesMemory(personId, answer);
    if (replicaHasEntries === true) clearJustEntered();
  }, [personId, answer, replicaHasEntries]);

  if (answer !== 'unknown') return answer;
  return personId && readOwnEntriesMemory(personId) === 'yes' ? 'yes' : 'unknown';
}
