/**
 * useExhibitorUpcomingShows — the exhibitor's entered-but-not-yet-started shows,
 * for the Ringside entry chooser (`/at-show`).
 *
 * Reads the same account-level `getUserEntries` source My Shows uses.
 *
 * Since MYK9-536 that source is NETWORK-FIRST: the authoritative view, with the
 * per-show replica as the fallback when the view fails or times out. This hook
 * sets `networkMode: 'always'` so the fallback stays reachable offline — though
 * only once identity has resolved, since the query is gated on `personId`.
 * and `useHasAnyEntryForShow` already use, so this adds no new network path;
 * the bucketing itself lives in the pure `selectExhibitorUpcomingShows`.
 *
 * Identity note: `personId` resolves through `useEntriesPersonId` — the legacy
 * `people` lookup, then `userWithRoles.databaseUserId` — and that lookup PAUSES
 * offline — so it can stay null
 * indefinitely on a cold offline boot. This hook deliberately does NOT report
 * that as `isLoading`: `useRingsideEntryShows` folds every source's flag into
 * one, and a never-resolving flag would park the whole entry point on "Finding
 * your show…" forever, for staff as well as exhibitors. A hard hang at the
 * ringside front door is worse than the empty chooser it would replace.
 *
 * The cost is that an unresolved identity is indistinguishable from "no
 * upcoming shows" here (the disabled-query-renders-false-zero shape). That is
 * contained because nothing downstream states the emptiness as fact — the
 * chooser's empty state offers the passcode and My Shows rather than asserting
 * the exhibitor has no entries — and because it degrades to exactly the
 * behaviour that shipped before this source existed.
 */

import { useQuery } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { getUserEntries } from '@/services/database/entries';
import { selectExhibitorUpcomingShows, type ExhibitorEntryRow } from './exhibitorRingsideShows';
import type { NamedShowSource } from './ringsideEntryResolver';

const EMPTY: NamedShowSource[] = [];

export interface ExhibitorUpcomingShows {
  upcomingShows: NamedShowSource[];
  isLoading: boolean;
}

export function useExhibitorUpcomingShows(): ExhibitorUpcomingShows {
  // The one resolver, shared with My Shows, My Payments and the access gate,
  // so the `getUserEntries` cache is one key per account (MYK9-629
  // restructure 4).
  const personId = useEntriesPersonId();

  const { data, isLoading } = useQuery({
    queryKey: ['at-show', 'exhibitor-upcoming-shows', personId],
    queryFn: async () => {
      const { data: rows, error } = await getUserEntries(personId as string);
      if (error) throw error;
      return selectExhibitorUpcomingShows((rows ?? []) as ExhibitorEntryRow[]);
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

  return {
    upcomingShows: data ?? EMPTY,
    // Never loading without an identity to load for — see the identity note above.
    isLoading: !!personId && isLoading,
  };
}
