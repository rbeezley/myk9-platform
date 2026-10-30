/**
 * Whether the signed-in viewer has an entry of their own, any show, past or upcoming.
 *
 * It answers the rail's My Entries item for staff who are also exhibitors. The entries replica is
 * per show, so it is never proof of absence; the one source is a head count on the authoritative
 * view, online with a resolved identity. Any local change to the entries or dogs replicas (a
 * checkout, a sync) re-asks the server soon after. Offline, pending or failed, the answer
 * remembered on this device holds; with none, `'unknown'` and the caller keeps the item.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { deriveEntriesIdentityState } from '@/pages/MyEntriesPage/modules/entriesIdentityState';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { serverHasOwnEntries } from '@/services/database/entries/ownEntriesExistence';
import {
  readOwnEntriesMemory,
  writeOwnEntriesMemory,
} from '@/features/own-entries/ownEntriesMemory';

export type OwnEntriesState = 'yes' | 'no' | 'unknown';

const REFETCH_DEBOUNCE_MS = 1000;

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

  // Account-scoped, no placeholder from another account. Online-only: offline it parks and the
  // remembered answer holds.
  const { data: serverHasEntries } = useQuery({
    queryKey: ['own-entries', 'server-has-any', personId],
    queryFn: serverHasOwnEntries,
    enabled: !!personId && identityState === 'resolved',
    staleTime: 5 * 60_000,
    retry: false,
  });

  // A checkout's entry or a dog arriving by sync re-asks the server; a burst is one refetch.
  useEffect(() => {
    if (!personId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          void queryClient.invalidateQueries({
            queryKey: ['own-entries', 'server-has-any', personId],
          }),
        REFETCH_DEBOUNCE_MS
      );
    };
    const unsubEntries = replicatedEntriesTable.subscribe(onChange, { emitCurrent: false });
    const unsubDogs = replicatedDogsTable.subscribe(onChange, { emitCurrent: false });
    return () => {
      clearTimeout(timer);
      unsubEntries();
      unsubDogs();
    };
  }, [personId, queryClient]);

  const remembered = personId ? readOwnEntriesMemory(personId) : null;
  const answer: OwnEntriesState =
    identityState === 'missing'
      ? 'no'
      : serverHasEntries !== undefined
        ? serverHasEntries
          ? 'yes'
          : 'no'
        : (remembered ?? 'unknown');

  // Only the authoritative read is worth remembering, never a guess.
  const authoritative = serverHasEntries !== undefined;
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
