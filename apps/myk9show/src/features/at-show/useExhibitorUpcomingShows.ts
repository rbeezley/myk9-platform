/**
 * useExhibitorUpcomingShows — the exhibitor's entered-but-not-yet-started shows,
 * for the Ringside entry chooser (`/at-show`).
 *
 * Reads the same account-level `getUserEntries` source My Shows uses.
 *
 * Since MYK9-536 that source is NETWORK-FIRST: the authoritative view, with the
 * per-show replica as the fallback when the view fails or times out. This hook
 * sets `networkMode: 'always'` so the fallback stays reachable offline — though
 * only once identity has resolved, since the query is gated on `personId`. It
 * is the same read My Shows and `useHasAnyEntryForShow` already make, so this
 * adds no new network path; the bucketing itself lives in the pure
 * `selectExhibitorUpcomingShows`.
 *
 * Identity note: `personId` can come from the AuthContext's durable pairing
 * before the `people` lookup finishes. When neither source is available, this
 * hook deliberately does NOT report
 * that as `isLoading`: `useRingsideEntryShows` folds every source's flag into
 * one, and a never-resolving flag would park the whole entry point on "Finding
 * your show…" forever, for staff as well as exhibitors. A hard hang at the
 * ringside front door is worse than the empty chooser it would replace.
 *
 * The hook returns the identity state separately from the rows. Consumers can
 * keep the chooser's non-blocking loading behavior while avoiding a false
 * "no upcoming shows" or stranger decision during a cold offline boot.
 */

import { useQuery } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getUserEntries } from '@/services/database/entries';
import type { UserEntriesSource } from '@/services/database/entries/userEntriesRead';
import type { PersonIdentityState } from '@/context/authContextTypes';
import { selectExhibitorUpcomingShows, type ExhibitorEntryRow } from './exhibitorRingsideShows';
import type { NamedShowSource } from './ringsideEntryResolver';
import {
  deriveAccountEntryReadState,
  type AccountEntryReadState,
} from '@/features/account-entry-read/accountEntryReadState';

const EMPTY: NamedShowSource[] = [];

/** @deprecated Use AccountEntryReadState at call sites. */
export type ExhibitorUpcomingReadState = AccountEntryReadState;

interface UpcomingShowsRead {
  shows: NamedShowSource[];
  source: UserEntriesSource;
}

export interface ExhibitorUpcomingShows {
  upcomingShows: NamedShowSource[];
  isLoading: boolean;
  identityState: PersonIdentityState;
  hasUsablePersonId: boolean;
  readState: ExhibitorUpcomingReadState;
}

export function useExhibitorUpcomingShows(): ExhibitorUpcomingShows {
  // The one resolver, shared with My Shows, My Payments and the access gate,
  // so the `getUserEntries` cache is one key per account (MYK9-629
  // restructure 4).
  const personId = useEntriesPersonId();
  const {
    user,
    personIdentityState: authIdentityState,
    hasUsablePersonId: authHasUsablePersonId,
  } = useAuthContext();
  const identityState: PersonIdentityState =
    authIdentityState ?? (personId ? 'resolved' : 'unresolved');
  const hasUsablePersonId = authHasUsablePersonId ?? Boolean(personId);

  const { data, isLoading, isPending, isError } = useQuery<UpcomingShowsRead>({
    queryKey: ['at-show', 'exhibitor-upcoming-shows', personId],
    queryFn: async () => {
      const { data: rows, error, source } = await getUserEntries(personId as string);
      if (error) throw error;
      return {
        shows: selectExhibitorUpcomingShows((rows ?? []) as ExhibitorEntryRow[]),
        source,
      };
    },
    enabled: !!personId,
    staleTime: 60_000,
    // One retry, not the global default of two: each attempt pays the full
    // `getUserEntries` view deadline, so the default turns a dead network into
    // a ~46s spinner before the replica fallback is ever shown.
    retry: 1,
    // `getUserEntries` carries its own offline fallback (the replicated
    // snapshot), but React Query's default `networkMode: 'online'` parks
    // this query at `fetchStatus: 'paused'` while offline and never calls
    // it, so the fallback is unreachable exactly when it matters. Same
    // reason as `useAtShowClassList` / `RingsideShowBoundary`.
    networkMode: 'always' as const,
  });
  const readState = deriveAccountEntryReadState({
    hasUser: Boolean(user?.id),
    personId: personId ?? null,
    personIdentityState: identityState,
    isPending: isPending ?? isLoading,
    isError,
    source: data?.source,
  });

  return {
    upcomingShows: data?.shows ?? EMPTY,
    // Never loading without an identity to load for — see the identity note above.
    isLoading: !!personId && isLoading,
    identityState,
    hasUsablePersonId,
    readState,
  };
}
