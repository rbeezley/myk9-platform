import { useEffect, useMemo } from 'react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';

/**
 * Manages announcement store subscription lifecycle.
 * Combines two show ID sources:
 *   - Exhibitors: shows they have entries for today (via useShowDayData)
 *   - Officials: the show they're managing in Mission Control (via showStore)
 * Mount once inside AuthProvider tree (App.tsx, not main.tsx — needs useAuthContext).
 */
export function useAnnouncementSubscription() {
  const { userWithRoles } = useAuthContext();
  const subscribe = useAnnouncementStore(s => s.subscribe);
  const unsubscribe = useAnnouncementStore(s => s.unsubscribe);

  // Exhibitor path: shows they have entries for today
  const { activeShows } = useShowDayData();
  const exhibitorShowIds = useMemo(() => activeShows.map(s => s.showId), [activeShows]);

  // Official path: show they're managing in Mission Control
  const selectedShowId = useShowStore(s => s.selectedShowId);

  // Union both sources, deduplicated
  const showIds = useMemo(() => {
    const ids = new Set(exhibitorShowIds);
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids];
  }, [exhibitorShowIds, selectedShowId]);

  useEffect(() => {
    if (!userWithRoles) {
      unsubscribe();
      return;
    }

    subscribe(showIds);

    return () => {
      unsubscribe();
    };
  }, [userWithRoles, showIds, subscribe, unsubscribe]);
}
