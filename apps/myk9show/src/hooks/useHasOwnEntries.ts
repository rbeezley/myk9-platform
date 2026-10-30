/**
 * Whether the signed-in viewer has an entry of their own, any show, past or upcoming.
 *
 * It answers the rail's My Entries item for staff who are also exhibitors. The entries replica is
 * per show, so an empty replica is an absence of knowledge, never proof. A replica that holds an
 * entry is an immediate `'yes'`; otherwise, online with a resolved
 * identity, one head count on the authoritative view decides. Offline, pending or failed, the
 * answer remembered on this device holds; with none, `'unknown'` and the caller keeps the item.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { deriveEntriesIdentityState } from '@/pages/MyEntriesPage/modules/entriesIdentityState';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { serverHasOwnEntries } from '@/services/database/entries/ownEntriesExistence';
import { readOwnReplicaEntries } from '@/services/database/entries/ownReplicaEntries';
import {
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

  // Account-scoped, no placeholder from another account. Online-only: offline it parks and the
  // remembered answer holds.
  const { data: serverHasEntries } = useQuery({
    queryKey: ['own-entries', 'server-has-any', personId],
    queryFn: serverHasOwnEntries,
    enabled: !!personId && identityState === 'resolved',
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A sync or a local write can add the first entry while the app is open.
  useEffect(() => {
    if (!personId) return;
    return replicatedEntriesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeyFor(personId) }),
      { emitCurrent: false }
    );
  }, [personId, queryClient]);

  const remembered = personId ? readOwnEntriesMemory(personId) : null;
  const fromReplica = replicaHasEntries === true;
  const answer: OwnEntriesState = fromReplica
    ? 'yes'
    : identityState === 'missing'
      ? 'no'
      : serverHasEntries !== undefined
        ? serverHasEntries
          ? 'yes'
          : 'no'
        : (remembered ?? 'unknown');

  // Only a replica hit or the authoritative read is worth remembering, never a guess.
  const authoritative = fromReplica || serverHasEntries !== undefined;
  useEffect(() => {
    if (!personId || !authoritative || answer === 'unknown') return;
    writeOwnEntriesMemory(personId, answer);
  }, [personId, answer, authoritative]);

  return answer;
}

/** The page a checkout lands on. While the viewer is there, the rail must offer it too. */
const MY_ENTRIES_PATH = '/exhibitor/entries';

/**
 * The rail's answer for My Entries on this route. A first checkout lands on My Entries before the
 * server count can see the new entry (it exists once the payment webhook lands), so on that page
 * a `'no'` reads as `'unknown'` and the item stays, agreeing with the page (MYK9-1491). Elsewhere
 * the server count decides. A route check, not a cache write, so no async ordering can undo it.
 */
export function railOwnEntriesState(state: OwnEntriesState, pathname: string): OwnEntriesState {
  const onMyEntries = pathname === MY_ENTRIES_PATH || pathname.startsWith(`${MY_ENTRIES_PATH}/`);
  return state === 'no' && onMyEntries ? 'unknown' : state;
}
