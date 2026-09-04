/**
 * useExhibitorUpcomingShows — the exhibitor's entered-but-not-yet-started shows,
 * for the Ringside entry chooser (`/at-show`).
 *
 * Reads the same account-level, offline-aware `getUserEntries` source My Shows
 * and `useHasAnyEntryForShow` already use, so this adds no new network path;
 * the bucketing itself lives in the pure `selectExhibitorUpcomingShows`.
 *
 * Identity note: `personId` resolves from `userWithRoles.databaseUserId`, which
 * comes from the `people` lookup and PAUSES offline — so it can stay null
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
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { getUserEntries } from '@/services/database/entries';
import { selectExhibitorUpcomingShows, type ExhibitorEntryRow } from './exhibitorRingsideShows';
import type { NamedShowSource } from './ringsideEntryResolver';

const EMPTY: NamedShowSource[] = [];

export interface ExhibitorUpcomingShows {
  upcomingShows: NamedShowSource[];
  isLoading: boolean;
}

export function useExhibitorUpcomingShows(): ExhibitorUpcomingShows {
  const personId = useCurrentUserPersonId();

  const { data, isLoading } = useQuery({
    queryKey: ['at-show', 'exhibitor-upcoming-shows', personId],
    queryFn: async () => {
      const { data: rows, error } = await getUserEntries(personId as string);
      if (error) throw error;
      return selectExhibitorUpcomingShows((rows ?? []) as ExhibitorEntryRow[]);
    },
    enabled: !!personId,
    staleTime: 60_000,
  });

  return {
    upcomingShows: data ?? EMPTY,
    // Never loading without an identity to load for — see the identity note above.
    isLoading: !!personId && isLoading,
  };
}
