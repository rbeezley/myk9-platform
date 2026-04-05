import { create } from 'zustand';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { mockShows } from '@/mockData/mockShows';
import { shouldUseMockData } from '@/config/dataSource';
import {
  performCascadingDelete,
  previewCascadingDelete,
  type CascadingDeletePreview,
} from '@/utils/cascadingDelete';
import { replicatedShowsTable, type ReplicatedShow } from '@/services/replication';
import {
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { supabase } from '@/services/database/supabaseClient';
import { getLastModifiedBy } from '@/utils/authHelpers';
import {
  reportStoreError,
  reportWarning,
  reportInfo,
  reportDebug,
} from '@/utils/standardizedErrorHandler';
import { useClubStore } from './clubStore';
import { useUserStore } from './userStore';
import { buildAssignedJudges } from '@/utils/buildAssignedJudges';

/**
 * Convert ReplicatedShow (database schema) to Show (app schema)
 * Local-only fields are initialized to defaults
 */
function replicatedToShow(replicated: ReplicatedShow): Show {
  return {
    id: replicated.id,
    name: replicated.name,
    organization: replicated.organization,
    startDate: replicated.startDate,
    endDate: replicated.endDate,
    location: replicated.location || '',
    status: replicated.status || 'draft',
    events: [], // Local-only: events managed separately
    source: 'external', // From sync = external
    entryOpenDate: replicated.entryOpenDate || '',
    entryCloseDate: replicated.entryCloseDate || '',
    preEntryFee: replicated.preEntryFee?.toString() || '',
    dayOfShowFee: replicated.dayOfShowFee?.toString() || '',
    clubId: replicated.clubId || '',
    clubName: '', // Derived from club store
    clubAddress: '', // Derived from club store
    clubEmail: '', // Derived from club store
    logoUrl: replicated.logoUrl || '',
    coverImageUrl: replicated.coverImageUrl || '',
    accentColor: replicated.accentColor || '',
    assignedJudges: [], // Populated by judge_assignments subscription
    trials: [], // Local-only: managed by trialStore
    stats: [], // Local-only: calculated
    acceptCheckPayments: replicated.acceptCheckPayments,
    acceptCashPayments: replicated.acceptCashPayments,
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated show data with existing local show data
 * Preserves local-only fields (trials, judges, stats)
 */
function mergeShowData(replicated: ReplicatedShow, existing: Show | undefined): Show {
  const base = replicatedToShow(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields from existing
    events: existing.events || [],
    source: existing.source || 'external',
    clubName: existing.clubName || '',
    clubAddress: existing.clubAddress || '',
    clubEmail: existing.clubEmail || '',
    // assignedJudges populated by judge_assignments subscription — don't preserve stale local data
    trials: existing.trials || [],
    stats: existing.stats || [],
  };
}

// Input types for creating/updating shows
export interface ShowInput {
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  events: string[];
  source: 'myK9Show' | 'external';
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  clubId: string;
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  startingArmbandNumber?: number | undefined;
  acceptCheckPayments?: boolean | undefined;
  acceptCashPayments?: boolean | undefined;
  assignedJudges?: ShowJudgeAssignment[] | undefined;
  trials?:
    | Array<{
        id: string;
        name: string;
        date: string;
        trialNumber: string;
        status: string;
      }>
    | undefined;
}

interface ShowStore {
  shows: Show[];
  selectedShowId: string;
  isLoading: boolean;
  error: string | null;

  // Local-First Actions
  addShow: (showData: ShowInput) => Promise<Show>;
  updateShow: (id: string, updates: Partial<ShowInput>) => Promise<Show | null>;
  deleteShow: (id: string) => Promise<void>;
  deleteShowCascading: (id: string) => Promise<void>;
  getShowById: (id: string) => Show | null;
  getShowsByClub: (clubId: string) => Show[];

  // Data Management
  setShows: (shows: Show[]) => void;
  loadShows: () => Promise<void>;

  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';

  // Legacy methods for compatibility
  addShowLegacy: (show: Show) => void;
  updateShowLegacy: (show: Show) => void;
  removeShow: (id: string) => void;
  removeShowCascading: (id: string) => void;
  previewCascadingDelete: (id: string) => CascadingDeletePreview | null;

  // Selection
  selectShow: (id: string) => void;

  // Subscription Management (for replicated table sync)
  _unsubscribe: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;
}

export const useShowStore = create<ShowStore>()((set, get) => ({
  shows: shouldUseMockData('USE_MOCK_SHOWS') ? mockShows : [],
  selectedShowId: shouldUseMockData('USE_MOCK_SHOWS') ? mockShows[0]?.id || '' : '',
  isLoading: false,
  error: null,
  _unsubscribe: null,

  // Local-First Implementation
  addShow: async (showData: ShowInput): Promise<Show> => {
    try {
      set({ isLoading: true, error: null });

      // Create show in replicated table (handles ID generation and sync metadata)
      const replicatedShow = await replicatedShowsTable.createShow({
        name: showData.name,
        organization: showData.organization,
        startDate: showData.startDate,
        endDate: showData.endDate,
        location: showData.location || undefined,
        status: showData.status || undefined,
        entryOpenDate: showData.entryOpenDate || undefined,
        entryCloseDate: showData.entryCloseDate || undefined,
        preEntryFee: showData.preEntryFee ? parseFloat(showData.preEntryFee) : undefined,
        dayOfShowFee: showData.dayOfShowFee ? parseFloat(showData.dayOfShowFee) : undefined,
        clubId: showData.clubId || undefined,
        acceptCheckPayments: showData.acceptCheckPayments,
        acceptCashPayments: showData.acceptCashPayments,
      });

      // Create full Show with local-only fields
      const newShow: Show = {
        ...replicatedToShow(replicatedShow),
        // Add local-only fields from input
        events: showData.events || [],
        source: showData.source || 'myK9Show',
        clubName: showData.clubName || '',
        clubAddress: showData.clubAddress || '',
        clubEmail: showData.clubEmail || '',
        assignedJudges: showData.assignedJudges || [],
        trials: showData.trials || [],
        stats: [],
      };

      // Optimistic update - add to store immediately
      set(state => ({
        shows: [...state.shows, newShow],
        isLoading: false,
      }));

      // Update the related club's upcomingShows array
      if (newShow.clubId) {
        try {
          const clubStore = useClubStore.getState();
          const club = clubStore.clubs.find(c => c.id === newShow.clubId);
          reportDebug('store', 'Show->Club Association Debug', {
            newShowId: newShow.id,
            newShowName: newShow.name,
            clubId: newShow.clubId,
            clubFound: !!club,
            clubName: club?.name,
            currentUpcomingShows: club?.upcomingShows || [],
          });
          if (club) {
            // Ensure upcomingShows array exists
            const currentUpcomingShows = club.upcomingShows || [];
            const updatedClub = {
              ...club,
              upcomingShows: [
                ...(currentUpcomingShows || []),
                {
                  id: newShow.id,
                  name: newShow.name,
                  date: newShow.startDate,
                  location: newShow.location,
                  description: `${newShow.organization} show hosted by ${newShow.clubName}`,
                },
              ],
              pastShows: club.pastShows || [],
            };
            reportDebug('store', 'Updating club with new upcoming show', {
              clubId: updatedClub.id,
              clubName: updatedClub.name,
              oldUpcomingShows: currentUpcomingShows,
              newUpcomingShows: updatedClub.upcomingShows,
              arrayLengthBefore: currentUpcomingShows.length,
              arrayLengthAfter: updatedClub.upcomingShows.length,
            });
            clubStore.updateClub(updatedClub);

            // Verify the update worked
            setTimeout(() => {
              const verifyClub = useClubStore.getState().clubs.find(c => c.id === newShow.clubId);
              reportDebug('store', 'Verification - Club after update', {
                clubId: verifyClub?.id,
                upcomingShowsCount: verifyClub?.upcomingShows?.length || 0,
                upcomingShows: verifyClub?.upcomingShows,
              });
            }, 100);
          } else {
            reportWarning('store', `Club not found for ID: ${newShow.clubId}`);
          }
        } catch (clubError) {
          reportWarning('store', 'Failed to update club with new show', {
            error: clubError,
            clubId: newShow.clubId,
          });
        }
      }

      return newShow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add show';
      reportStoreError('addShow', 'showStore', error, {
        showName: showData.name,
        clubId: showData.clubId,
      });
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  updateShow: async (id: string, updates: Partial<ShowInput>): Promise<Show | null> => {
    try {
      set({ isLoading: true, error: null });

      const currentShow = get().shows.find(s => s.id === id);
      if (!currentShow) {
        const error = `Show with id ${id} not found`;
        set({ error, isLoading: false });
        return null;
      }

      // Update in replicated table (handles version increment and sync metadata)
      // Build update object with only defined values to satisfy exactOptionalPropertyTypes
      const replicatedUpdates: Partial<ReplicatedShow> = {};
      if (updates.name !== undefined) replicatedUpdates.name = updates.name;
      if (updates.organization !== undefined) replicatedUpdates.organization = updates.organization;
      if (updates.startDate !== undefined) replicatedUpdates.startDate = updates.startDate;
      if (updates.endDate !== undefined) replicatedUpdates.endDate = updates.endDate;
      if (updates.location !== undefined) replicatedUpdates.location = updates.location;
      if (updates.status !== undefined) replicatedUpdates.status = updates.status;
      if (updates.entryOpenDate !== undefined)
        replicatedUpdates.entryOpenDate = updates.entryOpenDate;
      if (updates.entryCloseDate !== undefined)
        replicatedUpdates.entryCloseDate = updates.entryCloseDate;
      if (updates.preEntryFee !== undefined)
        replicatedUpdates.preEntryFee = parseFloat(updates.preEntryFee);
      if (updates.dayOfShowFee !== undefined)
        replicatedUpdates.dayOfShowFee = parseFloat(updates.dayOfShowFee);
      if (updates.clubId !== undefined) replicatedUpdates.clubId = updates.clubId;
      if (updates.acceptCheckPayments !== undefined)
        replicatedUpdates.acceptCheckPayments = updates.acceptCheckPayments;
      if (updates.acceptCashPayments !== undefined)
        replicatedUpdates.acceptCashPayments = updates.acceptCashPayments;
      if ('logoUrl' in updates) replicatedUpdates.logoUrl = updates.logoUrl as string;
      if ('coverImageUrl' in updates)
        replicatedUpdates.coverImageUrl = updates.coverImageUrl as string;
      if ('accentColor' in updates) replicatedUpdates.accentColor = updates.accentColor as string;

      await replicatedShowsTable.updateShow(id, replicatedUpdates);

      // Create updated show with local-only fields preserved
      // Filter out undefined values from updates to satisfy exactOptionalPropertyTypes
      const definedUpdates: Partial<Show> = {};
      if (updates.name !== undefined) definedUpdates.name = updates.name;
      if (updates.organization !== undefined) definedUpdates.organization = updates.organization;
      if (updates.startDate !== undefined) definedUpdates.startDate = updates.startDate;
      if (updates.endDate !== undefined) definedUpdates.endDate = updates.endDate;
      if (updates.location !== undefined) definedUpdates.location = updates.location;
      if (updates.status !== undefined) definedUpdates.status = updates.status;
      if (updates.events !== undefined) definedUpdates.events = updates.events;
      if (updates.source !== undefined) definedUpdates.source = updates.source;
      if (updates.entryOpenDate !== undefined) definedUpdates.entryOpenDate = updates.entryOpenDate;
      if (updates.entryCloseDate !== undefined)
        definedUpdates.entryCloseDate = updates.entryCloseDate;
      if (updates.preEntryFee !== undefined) definedUpdates.preEntryFee = updates.preEntryFee;
      if (updates.dayOfShowFee !== undefined) definedUpdates.dayOfShowFee = updates.dayOfShowFee;
      if (updates.clubId !== undefined) definedUpdates.clubId = updates.clubId;
      if (updates.acceptCheckPayments !== undefined)
        definedUpdates.acceptCheckPayments = updates.acceptCheckPayments;
      if (updates.acceptCashPayments !== undefined)
        definedUpdates.acceptCashPayments = updates.acceptCashPayments;
      if (updates.clubName !== undefined) definedUpdates.clubName = updates.clubName;
      if (updates.clubAddress !== undefined) definedUpdates.clubAddress = updates.clubAddress;
      if (updates.clubEmail !== undefined) definedUpdates.clubEmail = updates.clubEmail;
      if ('logoUrl' in updates) definedUpdates.logoUrl = updates.logoUrl as string;
      if ('coverImageUrl' in updates)
        definedUpdates.coverImageUrl = updates.coverImageUrl as string;
      if ('accentColor' in updates) definedUpdates.accentColor = updates.accentColor as string;
      if (updates.assignedJudges !== undefined)
        definedUpdates.assignedJudges = updates.assignedJudges;
      if (updates.trials !== undefined) definedUpdates.trials = updates.trials;

      const updatedShow: Show = {
        ...currentShow,
        ...definedUpdates,
        // Update sync metadata
        _version: currentShow._version ? currentShow._version + 1 : 1,
        _lastModified: new Date(),
        _lastModifiedBy: getLastModifiedBy(),
        _syncStatus: 'pending',
      };

      // Optimistic update
      set(state => ({
        shows: state.shows.map(s => (s.id === id ? updatedShow : s)),
        isLoading: false,
      }));

      return updatedShow;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update show';
      reportStoreError('updateShow', 'showStore', error, { showId: id, updates });
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  deleteShow: async (id: string): Promise<void> => {
    try {
      set({ isLoading: true, error: null });

      // Soft delete via RPC — bypasses RLS WITH CHECK restriction on deleted_at
      const { error } = await supabase.rpc('soft_delete_show', { p_show_id: id });

      if (error) {
        throw new Error(`Soft delete failed: ${error.message}`);
      }

      // Remove from local IndexedDB cache
      await replicatedShowsTable.delete(id);

      // Remove from Zustand state
      set(state => ({
        shows: state.shows.filter(s => s.id !== id),
        isLoading: false,
        selectedShowId: state.selectedShowId === id ? '' : state.selectedShowId,
      }));

      reportInfo('store', 'Show soft-deleted', { showId: id });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete show';
      reportStoreError('deleteShow', 'showStore', error, { showId: id });
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  deleteShowCascading: async (id: string): Promise<void> => {
    try {
      reportInfo('store', 'Starting soft delete for show', { showId: id });

      // Soft delete the show via RPC — Supabase RLS policies on child tables
      // (trials, classes, entries) filter by deleted_at IS NULL on their own rows,
      // but the show's soft delete hides it from browse/detail views.
      // No need for cascading local deletes since the show simply disappears.
      await get().deleteShow(id);

      reportInfo('store', 'Show soft-deleted successfully', { showId: id });
    } catch (error) {
      reportStoreError('deleteShowCascading', 'showStore', error, { showId: id });
      throw error;
    }
  },

  getShowById: (id: string): Show | null => {
    return get().shows.find(s => s.id === id) || null;
  },

  getShowsByClub: (clubId: string): Show[] => {
    return get().shows.filter(s => s.clubId === clubId);
  },

  // Data Management
  setShows: shows => set({ shows }),

  loadShows: async (): Promise<void> => {
    try {
      set({ isLoading: true, error: null });

      if (shouldUseMockData('USE_MOCK_SHOWS')) {
        // Load mock data if configured
        set({ shows: mockShows, isLoading: false });
      } else {
        // Load from replicated table (IndexedDB)
        const replicatedShows = await replicatedShowsTable.getAllShows();

        const currentShows = get().shows;

        // Merge replicated data with existing local-only fields
        const mergedShows = replicatedShows.map(replicated => {
          const existing = currentShows.find(s => s.id === replicated.id);
          return mergeShowData(replicated, existing);
        });

        set({ shows: mergedShows, isLoading: false });
        reportDebug('store', 'Loaded shows from replicated table', { count: mergedShows.length });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load shows';
      reportStoreError('loadShows', 'showStore', error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  // Sync Status
  getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
    const show = get().shows.find(s => s.id === id);
    return show?._syncStatus || 'synced';
  },

  // Legacy methods for compatibility
  addShowLegacy: show => set(state => ({ shows: [...state.shows, show] })),
  updateShowLegacy: show =>
    set(state => ({
      shows: state.shows.map(s => (s.id === show.id ? show : s)),
    })),

  removeShow: id =>
    set(state => {
      reportWarning(
        'store',
        `Simple delete for show ${id} - Related data may become orphaned! Use deleteShowCascading() for safe deletion with cleanup`
      );

      return {
        shows: state.shows.filter(s => s.id !== id),
      };
    }),

  removeShowCascading: id =>
    set(state => {
      reportInfo('store', 'Starting cascading delete for show', { showId: id });

      // Perform cascading delete of all related data
      const result = performCascadingDelete(id);

      // Remove the show itself
      const updatedShows = state.shows.filter(s => s.id !== id);

      reportInfo('store', 'Cascading delete completed', {
        showDeleted: id,
        ...result,
      });

      return {
        shows: updatedShows,
        selectedShowId: state.selectedShowId === id ? '' : state.selectedShowId,
      };
    }),

  previewCascadingDelete: (id: string): CascadingDeletePreview | null => {
    const state = useShowStore.getState();
    const show = state.shows.find((s: Show) => s.id === id);
    if (!show) return null;

    return previewCascadingDelete(id, show.name);
  },

  // Selection
  selectShow: (id: string) => set({ selectedShowId: id }),

  // Subscription Management
  initializeSubscription: () => {
    // Skip if already subscribed or using mock data
    if (get()._unsubscribe || shouldUseMockData('USE_MOCK_SHOWS')) {
      return;
    }

    reportDebug('store', 'Initializing replicated table subscription for shows');

    // Subscribe to replicated table changes
    const unsubShows = replicatedShowsTable.subscribe(async shows => {
      const currentShows = get().shows;
      const allAssignments = await replicatedJudgeAssignmentsTable.getAll();
      const { people } = useUserStore.getState();

      // Merge replicated data with existing local-only fields
      const mergedShows = shows.map(replicated => {
        const existing = currentShows.find(s => s.id === replicated.id);
        const show = mergeShowData(replicated, existing);
        show.assignedJudges = buildAssignedJudges(allAssignments, show.id, people);
        return show;
      });

      set({ shows: mergedShows });

      reportDebug('store', 'Shows updated from replicated table', { count: mergedShows.length });
    });

    // Subscribe to judge assignment changes — re-compute assignedJudges for all shows
    const unsubJudgeAssignments = replicatedJudgeAssignmentsTable.subscribe(
      (assignments: ReplicatedJudgeAssignment[]) => {
        const { people } = useUserStore.getState();
        const currentShows = get().shows;

        // Build new judges per show, but only update state if something changed
        let changed = false;
        const updatedShows = currentShows.map(show => {
          const newJudges = buildAssignedJudges(assignments, show.id, people);
          const prev = show.assignedJudges;
          const same =
            prev.length === newJudges.length &&
            prev.every((j, i) => j.judgeId === newJudges[i]?.judgeId);
          if (!same) changed = true;
          return same ? show : { ...show, assignedJudges: newJudges };
        });

        if (changed) {
          set({ shows: updatedShows });
        }
      }
    );

    set({
      _unsubscribe: () => {
        unsubShows();
        unsubJudgeAssignments();
      },
    });

    // Load initial data
    get().loadShows();
  },

  cleanup: () => {
    const unsubscribe = get()._unsubscribe;
    if (unsubscribe) {
      unsubscribe();
      set({ _unsubscribe: null });
      reportDebug('store', 'Cleaned up replicated table subscription for shows');
    }
  },
}));
