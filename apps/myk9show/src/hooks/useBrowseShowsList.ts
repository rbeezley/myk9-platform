import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  GUEST_READ_QUERY_OPTIONS,
  isAccountSession,
  isPublicGuest,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { getPublicShows } from '@/services/database/shows';
import { mapDatabaseShowsArray } from '@/services/mappers/showMappers';
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import type { Show } from '@/types/show-types';

export const PUBLIC_SHOWS_QUERY_KEY = ['shows', 'public'] as const;

const NO_STORE_SHOWS: Show[] = [];

export interface BrowseShowsList {
  shows: Show[];
  /** A guest reads online; an account reads the shows replica. */
  isGuest: boolean;
  /** No list yet: auth, the replica read, the first sync, or the guest read is still running. */
  isLoading: boolean;
  showsError: Error | null;
  /** A signed-out guest's online-only read cannot run: the device is offline. */
  showsOffline: boolean;
  /** Re-reads the list: the guest query, or the replica after a failed device read. */
  retryShows: () => Promise<void>;
}

/**
 * The shows a viewer can browse, and nothing else: Find Shows (through `useBrowseShowsData`) and
 * the Shows list pane both read it. No entries, relationships or stats, so a second caller adds no
 * side effects.
 */
export function useBrowseShowsList(): BrowseShowsList {
  const { user: sessionUser, loading: authLoading } = useAuthContext();
  // A guest is signed out or a ringside passcode session (isPublicGuest);
  // only a real account reads the replica (INTENT below). Guest status keys on
  // the raw session, not userWithRoles: a signed-in session whose roles have
  // not loaded (or failed to) is still not a guest, and offline it keeps its
  // replica list. userWithRoles stays the input for role-dependent behavior only.
  const readsReplica = isAccountSession(sessionUser);
  const isGuest = isPublicGuest(sessionUser, authLoading);
  const rawStoreShows = useShowStore(s => (readsReplica ? s.shows : NO_STORE_SHOWS));
  // Store shows carry no trials, so stamp each with its entry-window zone
  // from the trial store: every Browse surface (cards, table, scrubber, map,
  // filters) judges entry status in the show's own zone (MYK9-714).
  const storeTrials = useTrialStore(s => s.trials);
  const storeShows = useMemo(
    () => withEntryWindowTimeZones(rawStoreShows, storeTrials),
    [rawStoreShows, storeTrials]
  );
  const showsLoading = useShowStore(s => readsReplica && s.isLoading);
  const loadShows = useShowStore(s => s.loadShows);

  // INTENT: MYK9-780, same owner decision as MYK9-747/768: public, signed-out
  // surfaces read online and never read the shared replica, and a ringside
  // passcode session is a guest here too. The shows replica holds whatever an
  // earlier signed-in session on this device could see (a secretary's drafts,
  // shows soft-deleted on the server since), so a guest's list and its stats are shows_select's answer for anon, never a
  // cached row, not even offline or after a failed read (guestServerRead.ts).
  const guestQuery = useQuery({
    queryKey: PUBLIC_SHOWS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await getPublicShows();
      if (error) throw error;
      return mapDatabaseShowsArray(data ?? []);
    },
    enabled: isGuest,
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  const guestRead = isGuest ? resolveGuestRead(guestQuery, isOnline) : null;
  const refetchGuestShows = guestQuery.refetch;

  let shows: Show[] = NO_STORE_SHOWS;
  if (readsReplica) shows = storeShows;
  else if (guestRead?.kind === 'ready') shows = guestRead.data;
  const showsOffline = guestRead?.kind === 'offline';
  const storeErrorMsg = useShowStore(s => (readsReplica ? s.error : null));
  let showsError = storeErrorMsg ? new Error(storeErrorMsg) : null;
  if (guestRead?.kind === 'error') showsError = new Error("Couldn't load shows");
  if (showsOffline) showsError = new Error('Offline');
  const { status: syncStatus } = useReplicationSync();

  // The auth-gated initial sync only fires once authLoading flips to false
  // and a session is available, so for signed-in users there's a window where
  // the store is empty but shows haven't been downloaded yet. Treat that
  // window as loading so the skeleton stays up instead of the empty-state
  // flash that previously required a hard refresh to clear. Skip for guests
  // because sync never runs without a session — otherwise the skeleton would
  // be stuck forever.
  const showsSyncPending =
    readsReplica &&
    (syncStatus.tablesStatus.shows === 'idle' || syncStatus.tablesStatus.shows === 'syncing');
  const isLoading =
    authLoading ||
    showsLoading ||
    (shows.length === 0 && showsSyncPending) ||
    guestRead?.kind === 'loading';

  const retryShows = useCallback(async () => {
    if (isGuest) await refetchGuestShows();
    // An account's list is the shows replica; a failed device read stays failed until re-read.
    else if (readsReplica) await loadShows();
  }, [isGuest, readsReplica, refetchGuestShows, loadShows]);

  return { shows, isGuest, isLoading, showsError, showsOffline, retryShows };
}
