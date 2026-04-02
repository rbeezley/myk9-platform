import { useEffect, useMemo } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';

/**
 * Manages message store subscription lifecycle.
 * Mirrors useAnnouncementSubscription — combines two show ID sources:
 *   - Exhibitors: shows they have entries for today (via useShowDayData)
 *   - Officials: the show they're managing in Mission Control (via showStore)
 * Mount once inside AuthProvider tree (App.tsx, not main.tsx — needs useAuthContext).
 */
export function useMessageSubscription() {
  const { user, userWithRoles } = useAuthContext();
  const subscribe = useMessageStore(s => s.subscribe);
  const unsubscribe = useMessageStore(s => s.unsubscribe);
  const setCurrentUserId = useMessageStore(s => s.setCurrentUserId);

  // Set current user ID whenever auth changes
  useEffect(() => {
    if (user?.id) {
      setCurrentUserId(user.id);
    }
  }, [user?.id, setCurrentUserId]);

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
