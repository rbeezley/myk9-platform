import { useEffect, useMemo } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { selectOwnedDogIds } from '@/utils/dogOwnership';

function retryIncompleteSubscription() {
  const state = useMessageStore.getState();
  if (state.error && !state._subscribing && state.currentShowIds.length > 0) {
    void state.subscribe(state.currentShowIds);
  }
}

/**
 * Manages message store subscription lifecycle.
 * Mirrors useAnnouncementSubscription — combines two show ID sources:
 *   - Exhibitors: shows they have entries for today (via useShowDayData)
 *   - Officials: the show they're managing in Mission Control (via showStore)
 * Mount once inside AuthProvider tree (App.tsx, not main.tsx — needs useAuthContext).
 */
export function useMessageSubscription() {
  const { user, userWithRoles, isSecretary, isAdmin, hasRole } = useAuthContext();
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
  const shows = useShowStore(s => s.shows);
  const storeEntries = useEntryStore(s => s.entries);
  const { dogs } = useDogStoreCompat();

  // Exhibitor path: all locally discoverable entered shows, including upcoming
  // shows that are not part of the active show-day data set.
  const databaseUserId = userWithRoles?.databaseUserId;
  const exhibitorEnteredShowIds = useMemo(() => {
    if (!databaseUserId) return [];
    const ownedDogIds = selectOwnedDogIds(dogs, databaseUserId);
    const showIds = new Set<string>();
    for (const entry of storeEntries) {
      if (ownedDogIds.has(entry.dogId) && entry.showId) {
        showIds.add(entry.showId);
      }
    }
    return [...showIds];
  }, [databaseUserId, dogs, storeEntries]);

  const managedShowIds = useMemo(() => {
    if (!(isSecretary || isAdmin || hasRole('club_admin'))) return [];
    return shows.map(show => show.id).filter(Boolean);
  }, [shows, isSecretary, isAdmin, hasRole]);

  // Union both sources, deduplicated
  const showIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const showId of exhibitorShowIds) ids.add(showId);
    for (const showId of exhibitorEnteredShowIds) ids.add(showId);
    if (selectedShowId) ids.add(selectedShowId);
    for (const showId of managedShowIds) ids.add(showId);
    return [...ids].sort().join(',');
  }, [exhibitorShowIds, exhibitorEnteredShowIds, selectedShowId, managedShowIds]);
  const showIds = useMemo(() => (showIdsKey ? showIdsKey.split(',') : []), [showIdsKey]);

  // Replication and auth refreshes replace objects even when their values stay
  // equal. Restart channels only for changed membership or auth data, retaining
  // every auth field so permission/scope changes still refresh the subscription.
  const authKey = userWithRoles ? JSON.stringify(userWithRoles) : null;

  useEffect(() => {
    if (!authKey) {
      unsubscribe();
      return;
    }

    subscribe(showIds);

    return () => {
      unsubscribe();
    };
  }, [authKey, showIds, subscribe, unsubscribe]);

  // Healthy subscriptions are stable. Failed initial reads may recover when
  // replication/auth refreshes or connectivity returns, without a polling loop.
  useEffect(() => {
    if (userWithRoles) retryIncompleteSubscription();
  }, [activeShows, dogs, storeEntries, shows, userWithRoles]);

  useEffect(() => {
    if (!authKey) return;
    window.addEventListener('online', retryIncompleteSubscription);
    return () => window.removeEventListener('online', retryIncompleteSubscription);
  }, [authKey]);
}
