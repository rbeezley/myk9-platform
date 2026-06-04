import { useEffect, useMemo } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowDayData } from '@/hooks/queries/useShowDayData';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

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
    const ownedDogIds = new Set(dogs.filter(dog => dog.ownerId === databaseUserId).map(dog => dog.id));
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
  const showIds = useMemo(() => {
    const ids = new Set<string>();
    for (const showId of exhibitorShowIds) ids.add(showId);
    for (const showId of exhibitorEnteredShowIds) ids.add(showId);
    if (selectedShowId) ids.add(selectedShowId);
    for (const showId of managedShowIds) ids.add(showId);
    return [...ids];
  }, [exhibitorShowIds, exhibitorEnteredShowIds, selectedShowId, managedShowIds]);

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
