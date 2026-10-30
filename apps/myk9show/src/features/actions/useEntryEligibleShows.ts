import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useMyShows } from '@/hooks/useMyShows';
import { useShowStore } from '@/store/showStore';
import { filterEntryEligibleShows } from './entryEligibleShows';
import type { EntryShowOption } from './createActions';

/**
 * The live shows (today, then upcoming soonest first) where this viewer may key an entry, read
 * from the shows replica so Add Entry works offline. Feeds the Create group's Add Entry and its
 * show picker, so the two can never list different shows.
 */
export function useEntryEligibleShows(): EntryShowOption[] {
  const { hasRole, userWithRoles } = useAuthContext();
  const shows = useShowStore(state => state.shows);
  const { today, upcoming } = useMyShows(shows);
  return useMemo(
    () =>
      filterEntryEligibleShows([...today, ...upcoming], { hasRole, userWithRoles }).map(show => ({
        id: show.id,
        name: show.name,
      })),
    [today, upcoming, hasRole, userWithRoles]
  );
}
