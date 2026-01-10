/**
 * Club Store - Offline-First State Management
 *
 * Uses @myk9/replication for offline-first data access with IndexedDB.
 * Syncs with Supabase when online.
 */

import { create } from 'zustand';
import { replicatedClubsTable, type ReplicatedClub } from '@/services/replication';
import type { Club } from '@/types/club-types';

/**
 * Convert ReplicatedClub to app Club type
 */
function replicatedToClub(rc: ReplicatedClub): Club {
  // Parse address if it's a combined string
  const addressParts = rc.address?.split(', ') || [];

  return {
    id: rc.id,
    name: rc.name,
    clubNumber: '',
    email: rc.email || '',
    phone: rc.phone || '',
    website: rc.website,
    description: rc.description || '',
    logo: rc.logoUrl || '',
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
    address: fullAddress,
    city: club.address.city,
    state: club.address.state,
    zipCode: club.address.zipCode,
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

  // Actions
  loadClubs: () => Promise<void>;
  syncClubs: () => Promise<void>;
  selectClub: (id: string) => void;
  addClub: (club: Club) => Promise<void>;
  updateClub: (club: Club) => Promise<void>;
  removeClub: (clubId: string) => Promise<void>;

  // Subscription management
  subscribeToChanges: () => () => void;
}

export const useClubStore = create<ClubStoreState>()((set, get) => ({
  clubs: [],
  selectedClubId: '',
  isLoading: false,
  isSyncing: false,
  error: null,

  /**
   * Load clubs from local IndexedDB cache
   * This is instant and works offline
   */
  loadClubs: async () => {
    set({ isLoading: true, error: null });

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
      console.error('[ClubStore] Failed to load clubs:', error);
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
        console.error('[ClubStore] Sync failed:', result.error);
        set({ error: result.error || 'Sync failed' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      console.error('[ClubStore] Sync error:', error);
      set({ error: errorMessage });
    } finally {
      set({ isSyncing: false });
    }
  },

  selectClub: (id: string) => set({ selectedClubId: id }),

  /**
   * Add a new club (saves to local cache, queued for sync)
   */
  addClub: async (club: Club) => {
    try {
      const replicated = clubToReplicated(club);
      await replicatedClubsTable.createClub(replicated);

      // Reload from cache
      await get().loadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add club';
      console.error('[ClubStore] Failed to add club:', error);
      set({ error: errorMessage });
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
      console.error('[ClubStore] Failed to update club:', error);
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
      console.error('[ClubStore] Failed to remove club:', error);
      set({ error: errorMessage });
    }
  },

  /**
   * Subscribe to real-time changes from the replicated table
   * Returns unsubscribe function
   */
  subscribeToChanges: () => {
    return replicatedClubsTable.subscribe((replicatedClubs) => {
      const clubs = replicatedClubs.map(replicatedToClub);
      set({ clubs });
    });
  },
}));
