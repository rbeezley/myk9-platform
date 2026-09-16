/**
 * useExhibitorUpcomingShows — the exhibitor's entered-but-not-yet-started shows,
 * for the Ringside entry chooser (`/at-show`).
 *
 * Reads the same account-level source My Shows uses, through
 * `useAccountEntries`: one shared key, one paged read, one retry policy
 * (MYK9-563 item 3). The bucketing itself lives in the pure
 * `selectExhibitorUpcomingShows`.
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
 * behaviour that shipped before this source existed. Making identity itself
 * offline-durable is MYK9-601.
 */

import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useAccountEntries, type AccountEntriesRead } from '@/hooks/queries/useAccountEntries';
import { selectExhibitorUpcomingShows, type ExhibitorEntryRow } from './exhibitorRingsideShows';
import type { NamedShowSource } from './ringsideEntryResolver';

const EMPTY: NamedShowSource[] = [];

export interface ExhibitorUpcomingShows {
  upcomingShows: NamedShowSource[];
  isLoading: boolean;
  /** Rows the authoritative view never confirmed — see `AccountEntriesRead`. */
  degraded: boolean;
}

/** Module-level so React Query does not re-run it on every render. */
function selectUpcoming(read: AccountEntriesRead) {
  return {
    upcomingShows: selectExhibitorUpcomingShows(read.rows as ExhibitorEntryRow[]),
    degraded: read.degraded,
  };
}

export function useExhibitorUpcomingShows(): ExhibitorUpcomingShows {
  const personId = useCurrentUserPersonId();
  const { data, isLoading } = useAccountEntries(personId, selectUpcoming);

  return {
    upcomingShows: data?.upcomingShows ?? EMPTY,
    // Never loading without an identity to load for — see the identity note above.
    isLoading: !!personId && isLoading,
    degraded: data?.degraded ?? false,
  };
}
