/**
 * Club Store - Offline-First State Management
 *
 * Uses @myk9/replication for offline-first data access with IndexedDB.
 * Syncs with Supabase when online.
 */

import { create } from 'zustand';
import { replicatedClubsTable, type ReplicatedClub } from '@/services/replication';
import type { Club } from '@/types/club-types';
import { logger } from '@/services/LoggingService';
import { DEFAULT_TIMEOUT_MS, withTimeout } from '@myk9/core';

export type ClubReadinessStatus = 'loading' | 'fresh' | 'offline' | 'unavailable';

export interface ClubReadinessResult {
  status: ClubReadinessStatus;
  clubs: Club[];
}

let clubSessionIsFresh = false;
let clubSyncInFlight: Promise<{ success: boolean }> | null = null;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/**
 * Convert ReplicatedClub to app Club type
 */
function replicatedToClub(rc: ReplicatedClub): Club {
  // Parse address if it's a combined string
  const addressParts = rc.address?.split(', ') || [];

  return {
    id: rc.id,
    name: rc.name,
    clubNumber: rc.clubNumber || '',
    email: rc.email || '',
    phone: rc.phone || '',
    website: rc.website,
    description: rc.description || '',
    logo: rc.logoUrl || '',
    coverImage: rc.coverImageUrl || '',
    accentColor: rc.accentColor || '',
    address: {
      street: addressParts[0] || '',
      city: rc.city || addressParts[1] || '',
      state: rc.state || addressParts[2]?.split(' ')[0] || '',
      zipCode: rc.zipCode || addressParts[2]?.split(' ')[1] || '',
      country: addressParts[3] || 'US',
    },
    upcomingShows: [],
    pastShows: [],
    _syncStatus: rc._syncStatus,
    _version: rc._version,
    _lastModified: rc._lastModified,
    _lastModifiedBy: rc._lastModifiedBy,
    _localOnly: rc._localOnly,
  };
}

/**
 * Convert app Club type to ReplicatedClub
 */
function clubToReplicated(club: Club): ReplicatedClub {
  const fullAddress = `${club.address.street}, ${club.address.city}, ${club.address.state} ${club.address.zipCode}, ${club.address.country}`;

  return {
    id: club.id,
    name: club.name,
    email: club.email,
    phone: club.phone,
    website: club.website,
    description: club.description,
    logoUrl: club.logo,
    coverImageUrl: club.coverImage || undefined,
    accentColor: club.accentColor || undefined,
    address: fullAddress,
    city: club.address.city,
    state: club.address.state,
    zipCode: club.address.zipCode,
    clubNumber: club.clubNumber || undefined,
    _syncStatus: club._syncStatus,
    _version: club._version,
    _lastModified: club._lastModified,
    _lastModifiedBy: club._lastModifiedBy,
    _localOnly: club._localOnly,
  };
}

export interface ClubStoreState {
  clubs: Club[];
  selectedClubId: string;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  clubReadiness: ClubReadinessStatus;

  // Actions
  loadClubs: () => Promise<void>;
  syncClubs: () => Promise<void>;
  ensureClubsReady: (options?: {
    requestedClubId?: string | undefined;
    force?: boolean;
  }) => Promise<ClubReadinessResult>;
  selectClub: (id: string) => void;
  addClub: (club: Club) => Promise<string | undefined>;
  updateClub: (club: Club) => Promise<void>;
  removeClub: (clubId: string) => Promise<void>;

  // Subscription management
  _unsubscribe: (() => void) | null;
  subscribeToChanges: () => () => void;
  initializeSubscription: () => void;
  cleanup: () => void;
}

export const useClubStore = create<ClubStoreState>()((set, get) => ({
  clubs: [],
  selectedClubId: '',
  isLoading: false,
  isSyncing: false,
  error: null,
  clubReadiness: 'loading',
  _unsubscribe: null,

  /**
   * Load clubs from local IndexedDB cache
   * This is instant and works offline
   */
  loadClubs: async () => {
    // Only show loading spinner on initial load, not on background refreshes
    const hasExistingData = get().clubs.length > 0;
    if (!hasExistingData) {
      set({ isLoading: true, error: null });
    }

    try {
      const replicatedClubs = await replicatedClubsTable.getAllClubs();
      const clubs = replicatedClubs.map(replicatedToClub);

      set({
        clubs,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load clubs';
      logger.error('Failed to load clubs', 'clubs', {}, error as Error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  /**
   * Sync clubs with Supabase server
   * Call this when online to fetch latest data
   */
  syncClubs: async () => {
    set({ isSyncing: true });

    try {
      // Sync with server (no license key needed for clubs)
      const result = await replicatedClubsTable.sync();

      if (result.success) {
        // Reload from local cache after sync
        await get().loadClubs();
      } else {
        logger.error('Sync failed', 'clubs', { error: result.error });
        set({ error: result.error || 'Sync failed' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      logger.error('Sync error', 'clubs', {}, error as Error);
      set({ error: errorMessage });
    } finally {
      set({ isSyncing: false });
    }
  },

  /**
   * Make the narrow public club replica ready for a route or club-admin
   * context. The remote operation remains in flight after a caller-visible
   * timeout so concurrent callers cannot create duplicate sync work.
   */
  ensureClubsReady: async ({ requestedClubId, force = false } = {}) => {
    // Only announce 'loading' when there is nothing usable to show yet.
    //
    // Consumers conditionally MOUNT on this readiness — useValidatedClubContext
    // returns { status: 'loading' } (so clubId is undefined) whenever it is
    // 'loading', and ClubPaymentsPage renders <ClubPaymentsCard> only when
    // clubId is set. Flipping a ready store back to 'loading' therefore unmounts
    // that subtree and destroys its local state.
    //
    // This is a shared action: UnifiedAppLayout, useBrowseClubsData and
    // ClubDetailPage all call it. Any of them firing while a treasurer is part
    // way through the payment-setup checklist unmounted the card and reset
    // showChecklist to false, which presents as "the button did nothing"
    // (QA-CLUB-PAYMENTS-041). The `await` below guarantees React renders the dip,
    // and the fast path at `clubSessionIsFresh` returns 'fresh' immediately after
    // — so the flap happened even when no work was needed.
    //
    // Mirrors what loadClubs already does with `isLoading`: a background refresh
    // does not get a spinner when cached data is on screen.
    const currentReadiness = get().clubReadiness;
    const hasUsableData =
      (currentReadiness === 'fresh' || currentReadiness === 'offline') && get().clubs.length > 0;
    if (!hasUsableData) {
      set({ clubReadiness: 'loading' });
    }
    await get().loadClubs();

    const cachedClubs = get().clubs;
    if (!isOnline()) {
      const status = cachedClubs.length > 0 ? 'offline' : 'unavailable';
      set({ clubReadiness: status });
      return { status, clubs: cachedClubs };
    }

    const requestedClubIsMissing =
      requestedClubId !== undefined && !cachedClubs.some(club => club.id === requestedClubId);
    if (!force && clubSessionIsFresh && !requestedClubIsMissing) {
      set({ clubReadiness: 'fresh' });
      return { status: 'fresh', clubs: cachedClubs };
    }

    if (!clubSyncInFlight) {
      clubSyncInFlight = replicatedClubsTable
        .sync()
        .then(async result => {
          if (result.success) {
            await get().loadClubs();
            clubSessionIsFresh = true;
          } else {
            clubSessionIsFresh = false;
            logger.warn('Club data refresh failed', 'clubs');
          }
          return { success: result.success };
        })
        .catch(() => {
          clubSessionIsFresh = false;
          logger.warn('Club data refresh failed', 'clubs');
          return { success: false };
        })
        .finally(() => {
          clubSyncInFlight = null;
        });
    }

    try {
      const result = await withTimeout(clubSyncInFlight, DEFAULT_TIMEOUT_MS, 'Club data refresh');
      const clubs = get().clubs;
      if (result.success) {
        set({ clubReadiness: 'fresh' });
        return { status: 'fresh', clubs };
      }
      set({ clubReadiness: 'unavailable' });
      return { status: 'unavailable', clubs };
    } catch {
      // Keep cached clubs visible, but do not let stale cache validate a
      // club-admin scope after a failed freshness check.
      const clubs = get().clubs;
      logger.warn('Club data refresh unavailable', 'clubs', {
        hasCachedClubs: clubs.length > 0,
      });
      set({ clubReadiness: 'unavailable' });
      return { status: 'unavailable', clubs };
    }
  },

  selectClub: (id: string) => set({ selectedClubId: id }),

  /**
   * Add a new club (saves to local cache, queued for sync)
   */
  addClub: async (club: Club): Promise<string | undefined> => {
    try {
      const replicated = clubToReplicated(club);
      const created = await replicatedClubsTable.createClub(replicated);

      // Reload from cache
      await get().loadClubs();
      return created.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add club';
      logger.error('Failed to add club', 'clubs', {}, error as Error);
      set({ error: errorMessage });
      return undefined;
    }
  },

  /**
   * Update an existing club (saves to local cache, queued for sync)
   */
  updateClub: async (club: Club) => {
    try {
      const replicated = clubToReplicated(club);
      await replicatedClubsTable.updateClub(club.id, replicated);

      // Reload from cache
      await get().loadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update club';
      logger.error('Failed to update club', 'clubs', {}, error as Error);
      set({ error: errorMessage });
    }
  },

  /**
   * Remove a club (from local cache)
   */
  removeClub: async (clubId: string) => {
    try {
      await replicatedClubsTable.deleteClubLocal(clubId);

      // Update local state
      set(state => ({
        clubs: state.clubs.filter(c => c.id !== clubId),
        selectedClubId: state.selectedClubId === clubId ? '' : state.selectedClubId,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove club';
      logger.error('Failed to remove club', 'clubs', {}, error as Error);
      set({ error: errorMessage });
    }
  },

  /**
   * Subscribe to real-time changes from the replicated table
   * Returns unsubscribe function
   */
  subscribeToChanges: () => {
    return replicatedClubsTable.subscribe(replicatedClubs => {
      const clubs = replicatedClubs.map(replicatedToClub);
      set({ clubs });
    });
  },

  initializeSubscription: () => {
    if (get()._unsubscribe) return;

    const unsubscribe = replicatedClubsTable.subscribe(replicatedClubs => {
      const clubs = replicatedClubs.map(replicatedToClub);
      set({ clubs });
    });

    set({ _unsubscribe: unsubscribe });
    get().loadClubs();
  },

  cleanup: () => {
    const unsubscribe = get()._unsubscribe;
    if (unsubscribe) {
      unsubscribe();
      set({ _unsubscribe: null });
    }
  },
}));

/** Reset the session marker between isolated tests and browser sessions. */
export function resetClubReadinessForTests(): void {
  clubSessionIsFresh = false;
  clubSyncInFlight = null;
  useClubStore.setState({ clubReadiness: 'loading' });
}
