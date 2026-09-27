import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { PeopleRosterFilter } from './peopleRoster';
import { normalizePeopleRosterView, writePeopleRosterView } from './peopleRosterRoutes';

/**
 * The roster's own two-way `?view=` URL state (MYK9-812), mirroring
 * `useSecretaryCockpitUrlState`'s shape. Replaces the one-way `rosterFilter`
 * read that never wrote back, so a refresh or shared link now preserves
 * whichever view staff had selected, not just the view a deep link requested.
 */
export function usePeopleRosterUrlState(): {
  view: PeopleRosterFilter;
  setView: (next: PeopleRosterFilter) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useMemo(() => normalizePeopleRosterView(searchParams), [searchParams]);

  const setView = useCallback(
    (next: PeopleRosterFilter) => {
      setSearchParams(previous => writePeopleRosterView(previous, next), { replace: true });
    },
    [setSearchParams]
  );

  return { view, setView };
}
