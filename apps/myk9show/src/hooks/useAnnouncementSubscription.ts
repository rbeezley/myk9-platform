import { useEffect, useMemo } from 'react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useAccountTodayEntries } from '@/features/show-today/accountTodayEntries';
import { useShowStore } from '@/store/showStore';

/**
 * Manages announcement store subscription lifecycle.
 * Combines two show ID sources:
 *   - Exhibitors: shows they have entries for today (via useShowDayData AND
 *     useAccountTodayEntries — see below)
 *   - Officials: the show they're managing in Mission Control (via showStore)
 * Mount once inside AuthProvider tree (App.tsx, not main.tsx — needs useAuthContext).
 */
export function useAnnouncementSubscription() {
  const { userWithRoles } = useAuthContext();
  const subscribe = useAnnouncementStore(s => s.subscribe);
  const unsubscribe = useAnnouncementStore(s => s.unsubscribe);

  // Exhibitor path: shows they have entries for today. Two sources, unioned:
  // `useShowDayData` reads the offline REPLICA, which can still be cold-empty
  // right after sign-in — before entries/classes/trials/shows have synced —
  // and reports "no shows today" as fact (MYK9-802). `useAccountTodayEntries`
  // is the same account-scoped RPC the My Shows "Show day is here" banner
  // already reads to answer the identical question, so unioning it here means
  // the inbox can never disagree with the banner about which shows are today's.
  const { activeShows } = useShowDayData();
  const accountTodayEntries = useAccountTodayEntries();
  const exhibitorShowIds = useMemo(() => {
    const ids = new Set(activeShows.map(s => s.showId));
    for (const entry of accountTodayEntries.data ?? []) ids.add(entry.showId);
    return [...ids];
  }, [activeShows, accountTodayEntries.data]);

  // Official path: show they're managing in Mission Control
  const selectedShowId = useShowStore(s => s.selectedShowId);

  // Union both sources, deduplicated
  const subscriptionKey = useMemo(() => {
    const ids = new Set(exhibitorShowIds);
    if (selectedShowId) ids.add(selectedShowId);
    return [...ids].sort().join('\0');
  }, [exhibitorShowIds, selectedShowId]);
  const showIds = useMemo(
    () => (subscriptionKey ? subscriptionKey.split('\0') : []),
    [subscriptionKey]
  );

  useEffect(() => {
    if (!userWithRoles) {
      unsubscribe();
      return;
    }

    subscribe(showIds);

    return () => {
      unsubscribe();
    };
  }, [userWithRoles, subscriptionKey, showIds, subscribe, unsubscribe]);
}
