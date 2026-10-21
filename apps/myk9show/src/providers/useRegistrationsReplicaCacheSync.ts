import { useEffect } from 'react';
import {
  useQueryClient,
  type Query,
  type QueryClient,
  type QueryFilters,
} from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { ARMBAND_LABEL_HELD_ENTRIES_KEY } from '@/hooks/queries/useArmbandLabelData';
import { isDogRosterQuery } from '@/hooks/queries/dogRosterMeta';

/** Longer than the replica's own notify debounce (100ms), so both edges of one change land in one window. */
export const REGISTRATION_REFRESH_COALESCE_MS = 150;

/**
 * MYK9-1303: the dog rosters (`useDogsQuery`, `useDogsByOwnerQuery`) are server
 * reads that cost about a second each; the sessions=50 baseline had 101 of them.
 * A sync pass changes the registrations replica in a burst, and refetching the
 * rosters on every burst meant their 5 minute staleTime never helped. So their
 * refresh is leading edge plus trailing: the first change after an idle period
 * refreshes them at once (an isolated change, such as this device's own upload
 * acknowledgement, lands as fast as it always did), and opens a window this long
 * in which further changes coalesce into ONE trailing refresh at the window's
 * end, if any arrived. After it the state is idle again. A burst therefore costs
 * at most two roster refetches per window, a change shows within the window, and
 * continuous changes cannot starve it. Every other registration read stays on
 * the short debounce.
 */
export const ROSTER_REFRESH_COALESCE_MS = 15_000;

/**
 * Refetch every read built on the registrations replica except the dog
 * rosters (see `refreshDogRosterReads`): each dog's registrations, the other
 * dog reads under `['dogs']` (detail, registrations), the other owner dog reads
 * under `['users', id, 'dogs']`, and the armband-label held-entry lookup (MYK9-1162).
 */
export function refreshRegistrationReads(queryClient: QueryClient): void {
  const filters: QueryFilters[] = [
    { queryKey: queryKeys.registrationsByDogAll },
    { queryKey: queryKeys.dogs, predicate: (query: Query) => !isDogRosterQuery(query) },
    {
      predicate: (query: Query) =>
        query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs' && !isDogRosterQuery(query),
    },
    // MYK9-1162: adding or removing a number releases or holds an entry, so the
    // armband-label held lookup must not print from the earlier answer.
    { queryKey: ARMBAND_LABEL_HELD_ENTRIES_KEY },
  ];
  cancelThenInvalidate(queryClient, filters);
}

/** Refetch the dog rosters, which read the registrations replica too (MYK9-1303). */
export function refreshDogRosterReads(queryClient: QueryClient): void {
  cancelThenInvalidate(queryClient, [{ predicate: isDogRosterQuery }]);
}

// Cancel first: invalidating dedupes onto a read already in flight, and a
// cold PostgREST read that started before this change can land after it
// and put the older answer back (refetchShowEntriesAfterScopedSync).
function cancelThenInvalidate(queryClient: QueryClient, filters: QueryFilters[]): void {
  for (const filter of filters) {
    void queryClient
      .cancelQueries(filter)
      .then(() => queryClient.invalidateQueries(filter))
      .catch(() => undefined);
  }
}

/**
 * The one refresh rule for registrations (MYK9-1090, plan §2). Every change to
 * a registration reaches the device through the replica: a sync, a direct
 * write mirrored into it, upload, Take theirs, Keep mine, Discard. So one
 * subscription refreshes the screens, and no path patches a cache by hand,
 * with one owner-approved exception: a delete hides its row optimistically
 * (useDeleteRegistrationMutation, MYK9-1143), and this listener's refetch then
 * reconciles it, so a discarded refusal brings the row back. A delete that
 * fails before writing re-reads the same queries; nothing restores by hand.
 */
export function useRegistrationsReplicaCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    // The replica notifies on a leading and a trailing edge, so one change
    // arrives twice: coalesce a burst into one trailing refresh.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    let trailingDue = false;
    // Runs once per settled change (after the debounce), never per replica notice.
    const refreshRosters = () => {
      if (windowTimer) {
        trailingDue = true;
        return;
      }
      refreshDogRosterReads(queryClient);
      windowTimer = setTimeout(() => {
        windowTimer = undefined;
        if (!trailingDue) return;
        trailingDue = false;
        refreshDogRosterReads(queryClient);
      }, ROSTER_REFRESH_COALESCE_MS);
    };
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        refreshRegistrationReads(queryClient);
        refreshRosters();
      }, REGISTRATION_REFRESH_COALESCE_MS);
    };
    const unsubscribe = replicatedDogRegistrationsTable.subscribe(scheduleRefresh, {
      emitCurrent: false,
      // A change the device then cannot read back (IndexedDB gone after a
      // failed mirror) still means the reads are stale: refetch them, and
      // the readers fall back to the server.
      onError: scheduleRefresh,
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(windowTimer);
      unsubscribe();
    };
  }, [queryClient]);
}
