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
import { ensureClubsIdentity, registerClubsIdentitySink } from './clubsIdentityBoundary';
import { clubsWithheldMessage, type ClubsIdentity } from './clubsIdentity';

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
    // MYK9-572: keep UNDEFINED (field absent — a pre-deploy cached row with
    // no authorizedAt at all) distinct from NULL (explicitly unauthorized).
    // Collapsing the two here made every cached club show an "Unauthorized"
    // badge to its own admins right after deploy / while offline, since
    // there was no way to tell "never synced this field" from "revoked".
    authorizedAt: rc.authorizedAt,
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
    // MYK9-572: round-trip, not editable here — clubToReplicated feeds a
    // FULL object into ReplicatedClubsTable.updateClub's `{...current,
    // ...updates}` merge, so omitting this would overwrite a cached
    // authorizedAt with undefined on every unrelated club edit (name, logo,
    // ...). The RPC (set_club_authorization) is the only real write path;
    // this is purely preservation.
    authorizedAt: club.authorizedAt,
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
  /**
   * The auth user who chose selectedClubId. This store is a singleton and is
   * not reset on sign-out, so consumers must ignore a selection made by a
   * different user rather than silently inheriting it (MYK9-138).
   */
  selectedClubUserId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  clubReadiness: ClubReadinessStatus;
  /**
   * Whose rows `clubs` may hold (MYK9-2168). Until the identity boundary has
   * verified the replica belongs to the signed-in account, EVERY writer of
   * `clubs` publishes nothing, including the subscription's first emission.
   */
  clubsIdentity: ClubsIdentity;

  // Actions
  loadClubs: () => Promise<void>;
  syncClubs: () => Promise<void>;
  ensureClubsReady: (options?: {
    requestedClubId?: string | undefined;
    force?: boolean;
  }) => Promise<ClubReadinessResult>;
  selectClub: (id: string, userId?: string | null) => void;
  addClub: (club: Club) => Promise<string | undefined>;
  updateClub: (club: Club) => Promise<void>;

  // Subscription management
  _unsubscribe: (() => void) | null;
  subscribeToChanges: () => () => void;
  initializeSubscription: () => void;
  cleanup: () => void;
}

const UNVERIFIED_CLUBS: ClubsIdentity = { status: 'unverified', reason: null, principalKey: null };

/** True when `identity` is still the store's current, verified identity. */
function isPublishable(identity: ClubsIdentity, current: ClubsIdentity): boolean {
  return identity.status === 'verified' && identity === current;
}

export const useClubStore = create<ClubStoreState>()((set, get) => ({
  clubs: [],
  selectedClubId: '',
  selectedClubUserId: null,
  isLoading: false,
  isSyncing: false,
  error: null,
  clubReadiness: 'loading',
  clubsIdentity: UNVERIFIED_CLUBS,
  _unsubscribe: null,

  /**
   * Load clubs from local IndexedDB cache
   * This is instant and works offline
   */
  loadClubs: async () => {
    const identity = get().clubsIdentity;
    // MYK9-2168: nothing is read into the store for an account the replica has
    // not been verified against.
    if (identity.status !== 'verified') return;

    // Only show loading spinner on initial load, not on background refreshes
    const hasExistingData = get().clubs.length > 0;
    if (!hasExistingData) {
      set({ isLoading: true, error: null });
    }

    try {
      const replicatedClubs = await replicatedClubsTable.getAllClubs();
      // The account changed while the read ran: these rows are not its to show.
      if (!isPublishable(identity, get().clubsIdentity)) {
        set({ isLoading: false });
        return;
      }
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
    // MYK9-2168: settle whose replica this is before pulling into it.
    await ensureClubsIdentity();
    const identity = get().clubsIdentity;
    if (identity.status !== 'verified') {
      set({ error: clubsWithheldMessage(identity.reason) });
      return;
    }
    set({ isSyncing: true });

    try {
      // Sync with server (no license key needed for clubs)
      const result = await replicatedClubsTable.sync();

      if (result.success) {
        // Reload from local cache after sync
        await get().loadClubs();
      } else {
        logger.error('Sync failed', 'clubs', { error: result.error });
        set({ error: result.error || 'Clubs could not be updated' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Clubs could not be updated';
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
    // MYK9-2168: no club is read or shown for an account the replica has not
    // been verified against; the reason is the store's, not a guess.
    await ensureClubsIdentity();
    if (get().clubsIdentity.status !== 'verified') {
      set({ clubReadiness: 'unavailable' });
      return { status: 'unavailable', clubs: [] };
    }
    const sessionIdentity = get().clubsIdentity;
    const currentReadiness = get().clubReadiness;
    const hasUsableData =
      (currentReadiness === 'fresh' || currentReadiness === 'offline') && get().clubs.length > 0;
    if (!hasUsableData) {
      set({ clubReadiness: 'loading' });
    }
    // MYK9-2104: every path below must END in a settled status. 'loading' is set
    // above with no timer behind it, so a local read that never returns (a
    // blocked IndexedDB) or a sync call that throws before a promise exists
    // used to strand every club-context page on "Checking your club access".
    try {
      await withTimeout(get().loadClubs(), DEFAULT_TIMEOUT_MS, 'Saved club read');
    } catch {
      logger.warn('Saved club read unavailable', 'clubs');
      set({ clubReadiness: 'unavailable' });
      return { status: 'unavailable', clubs: get().clubs };
    }

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
      // Promise.resolve().then wraps a synchronous throw from sync() as a
      // rejection, so the .catch below always settles the session.
      clubSyncInFlight = Promise.resolve()
        .then(() => replicatedClubsTable.sync())
        .then(async result => {
          if (result.success && isPublishable(sessionIdentity, get().clubsIdentity)) {
            await get().loadClubs();
            clubSessionIsFresh = true;
          } else if (result.success) {
            // The account changed under this pull: its freshness is not ours.
            clubSessionIsFresh = false;
          } else {
            clubSessionIsFresh = false;
            logger.warn('Club data refresh failed', 'clubs');
          }
          return { success: result.success && isPublishable(sessionIdentity, get().clubsIdentity) };
        })
        .catch(() => {
          clubSessionIsFresh = false;
          logger.warn('Club data refresh failed', 'clubs');
          return { success: false };
        })
        .finally(() => {
          if (clubSyncInFlight === thisSync) clubSyncInFlight = null;
        });
      const thisSync = clubSyncInFlight;
    }

    try {
      const result = await withTimeout(clubSyncInFlight, DEFAULT_TIMEOUT_MS, 'Club data refresh');
      if (!isPublishable(sessionIdentity, get().clubsIdentity)) {
        // The account changed while the refresh ran; the boundary owns what follows.
        return { status: 'unavailable', clubs: [] };
      }
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

  selectClub: (id: string, userId: string | null = null) =>
    set({ selectedClubId: id, selectedClubUserId: userId }),

  /**
   * Add a new club (saves to local cache, queued for sync)
   */
  addClub: async (club: Club): Promise<string | undefined> => {
    if (get().clubsIdentity.status !== 'verified') {
      set({ error: clubsWithheldMessage(get().clubsIdentity.reason) });
      return undefined;
    }
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
    if (get().clubsIdentity.status !== 'verified') {
      const message = clubsWithheldMessage(get().clubsIdentity.reason);
      set({ error: message });
      throw new Error(message);
    }
    try {
      const replicated = clubToReplicated(club);
      await replicatedClubsTable.updateClub(club.id, replicated);

      // Reload from cache
      await get().loadClubs();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update club';
      logger.error('Failed to update club', 'clubs', {}, error as Error);
      set({ error: errorMessage });
      // Callers confirm a save on resolve and report a failure on reject; a
      // swallowed failure made the edit panel close and announce a save that
      // never happened.
      throw error;
    }
  },

  /**
   * Subscribe to real-time changes from the replicated table
   * Returns unsubscribe function
   */
  subscribeToChanges: () => {
    const publishReplicaRows = (replicatedClubs: ReplicatedClub[]) => {
      // MYK9-2168: the first emission arrives before the boundary has verified
      // whose rows these are, and every later one must be for the verified
      // account too: unverified, nothing is published.
      if (get().clubsIdentity.status !== 'verified') return;
      set({ clubs: replicatedClubs.map(replicatedToClub) });
    };
    return replicatedClubsTable.subscribe(publishReplicaRows);
  },

  initializeSubscription: () => {
    if (get()._unsubscribe) return;
    const publishReplicaRows = (replicatedClubs: ReplicatedClub[]) => {
      if (get().clubsIdentity.status !== 'verified') return;
      set({ clubs: replicatedClubs.map(replicatedToClub) });
    };

    const unsubscribe = replicatedClubsTable.subscribe(publishReplicaRows);

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

/**
 * The identity boundary's one door into the store (MYK9-2168). An unverified
 * identity empties `clubs` in the same step, and forgets the previous
 * account's freshness and in-flight refresh, so nothing of it is reused.
 */
export function applyClubsIdentity(identity: ClubsIdentity): void {
  if (identity.status === 'verified') {
    useClubStore.setState({ clubsIdentity: identity });
    return;
  }
  clubSessionIsFresh = false;
  clubSyncInFlight = null;
  useClubStore.setState({
    clubsIdentity: identity,
    clubs: [],
    // Pages mount on 'loading' while the account settles; any settled
    // reason is a fail-closed 'unavailable'.
    clubReadiness: identity.reason === null ? 'loading' : 'unavailable',
    error: identity.reason === null ? null : clubsWithheldMessage(identity.reason),
  });
}

/** The pull the boundary just ran is this account's full, current pull. */
export function markClubsFresh(): void {
  clubSessionIsFresh = true;
}

/** Reset the session marker between isolated tests and browser sessions. */
export function resetClubReadinessForTests(): void {
  clubSessionIsFresh = false;
  clubSyncInFlight = null;
  useClubStore.setState({ clubReadiness: 'loading', clubsIdentity: UNVERIFIED_CLUBS });
}

registerClubsIdentitySink({
  apply: applyClubsIdentity,
  getIdentity: () => useClubStore.getState().clubsIdentity,
  reload: () => useClubStore.getState().loadClubs(),
  markFresh: markClubsFresh,
});
