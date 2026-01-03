import { create } from 'zustand';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { mockShows } from '@/mockData/mockShows';
import { shouldUseMockData } from '@/config/dataSource';
import { performCascadingDelete, previewCascadingDelete, type CascadingDeletePreview } from '@/utils/cascadingDelete';
import { replicatedShowsTable, type ReplicatedShow } from '@/services/replication';
import { getLastModifiedBy } from '@/utils/authHelpers';
import { reportStoreError, reportWarning, reportInfo, reportDebug } from '@/utils/standardizedErrorHandler';
import { useClubStore } from './clubStore';

/**
 * Convert ReplicatedShow (database schema) to Show (app schema)
 * Local-only fields are initialized to defaults
 */
function replicatedToShow(replicated: ReplicatedShow): Show {
  return {
    id: replicated.id,
    name: replicated.name,
    type: replicated.type,
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
    chairman: replicated.chairman || '',
    secretary: replicated.secretary || '',
    chiefSteward: replicated.chiefSteward || '',
    assignedJudges: [], // Local-only: managed separately
    trials: [], // Local-only: managed by trialStore
    stats: [], // Local-only: calculated
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
    assignedJudges: existing.assignedJudges || [],
    trials: existing.trials || [],
    stats: existing.stats || [],
  };
}

// Input types for creating/updating shows
export interface ShowInput {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  status: string;
  events: string[];
  source: 'myK9Show' | 'external';
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: string;
  dayOfShowFee?: string;
  clubId: string;
  clubName: string;
  clubAddress: string;
  clubEmail: string;
  chairman: string;
  secretary: string;
  chiefSteward: string;
  assignedJudges?: ShowJudgeAssignment[];
  trials?: Array<{
    id: string;
    name: string;
    date: string;
    trialNumber: string;
    status: string;
  }>;
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

export const useShowStore = create<ShowStore>()(
  (set, get) => ({
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
            type: showData.type,
            startDate: showData.startDate,
            endDate: showData.endDate,
            location: showData.location || undefined,
            status: showData.status || undefined,
            entryOpenDate: showData.entryOpenDate || undefined,
            entryCloseDate: showData.entryCloseDate || undefined,
            preEntryFee: showData.preEntryFee ? parseFloat(showData.preEntryFee) : undefined,
            dayOfShowFee: showData.dayOfShowFee ? parseFloat(showData.dayOfShowFee) : undefined,
            clubId: showData.clubId || undefined,
            chairman: showData.chairman || undefined,
            secretary: showData.secretary || undefined,
            chiefSteward: showData.chiefSteward || undefined,
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
          set((state) => ({
            shows: [...state.shows, newShow],
            isLoading: false
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
                currentUpcomingShows: club?.upcomingShows || []
              });
              if (club) {
                // Ensure upcomingShows array exists
                const currentUpcomingShows = club.upcomingShows || [];
                const updatedClub = {
                  ...club,
                  upcomingShows: [...(currentUpcomingShows || []), {
                    id: newShow.id,
                    name: newShow.name,
                    date: newShow.startDate,
                    location: newShow.location,
                    description: `${newShow.type} show hosted by ${newShow.clubName}`
                  }],
                  pastShows: club.pastShows || []
                };
                reportDebug('store', 'Updating club with new upcoming show', {
                  clubId: updatedClub.id,
                  clubName: updatedClub.name,
                  oldUpcomingShows: currentUpcomingShows,
                  newUpcomingShows: updatedClub.upcomingShows,
                  arrayLengthBefore: currentUpcomingShows.length,
                  arrayLengthAfter: updatedClub.upcomingShows.length
                });
                clubStore.updateClub(updatedClub);

                // Verify the update worked
                setTimeout(() => {
                  const verifyClub = useClubStore.getState().clubs.find(c => c.id === newShow.clubId);
                  reportDebug('store', 'Verification - Club after update', {
                    clubId: verifyClub?.id,
                    upcomingShowsCount: verifyClub?.upcomingShows?.length || 0,
                    upcomingShows: verifyClub?.upcomingShows
                  });
                }, 100);
              } else {
                reportWarning('store', `Club not found for ID: ${newShow.clubId}`);
              }
            } catch (clubError) {
              reportWarning('store', 'Failed to update club with new show', { error: clubError, clubId: newShow.clubId });
            }
          }

          return newShow;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to add show';
          reportStoreError('addShow', 'showStore', error, { showName: showData.name, clubId: showData.clubId });
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
          const replicatedUpdates: Partial<ReplicatedShow> = {
            name: updates.name,
            type: updates.type,
            startDate: updates.startDate,
            endDate: updates.endDate,
            location: updates.location || undefined,
            status: updates.status || undefined,
            entryOpenDate: updates.entryOpenDate || undefined,
            entryCloseDate: updates.entryCloseDate || undefined,
            preEntryFee: updates.preEntryFee ? parseFloat(updates.preEntryFee) : undefined,
            dayOfShowFee: updates.dayOfShowFee ? parseFloat(updates.dayOfShowFee) : undefined,
            clubId: updates.clubId || undefined,
            chairman: updates.chairman || undefined,
            secretary: updates.secretary || undefined,
            chiefSteward: updates.chiefSteward || undefined,
          };

          // Remove undefined values
          Object.keys(replicatedUpdates).forEach(key => {
            if (replicatedUpdates[key as keyof typeof replicatedUpdates] === undefined) {
              delete replicatedUpdates[key as keyof typeof replicatedUpdates];
            }
          });

          await replicatedShowsTable.updateShow(id, replicatedUpdates);

          // Create updated show with local-only fields preserved
          const updatedShow: Show = {
            ...currentShow,
            ...updates,
            // Update sync metadata
            _version: currentShow._version ? currentShow._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending'
          };

          // Optimistic update
          set((state) => ({
            shows: state.shows.map(s => s.id === id ? updatedShow : s),
            isLoading: false
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

          const showExists = get().shows.some(s => s.id === id);
          if (!showExists) {
            const error = `Show with id ${id} not found`;
            set({ error, isLoading: false });
            return;
          }

          // Delete from replicated table (marks for sync deletion)
          await replicatedShowsTable.delete(id);

          // Optimistic delete - remove immediately
          set((state) => ({
            shows: state.shows.filter(s => s.id !== id),
            isLoading: false,
            // Clear selection if deleted show was selected
            selectedShowId: state.selectedShowId === id ? '' : state.selectedShowId
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete show';
          reportStoreError('deleteShow', 'showStore', error, { showId: id });
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      deleteShowCascading: async (id: string): Promise<void> => {
        try {
          reportInfo('store', 'Starting cascading delete for show', { showId: id });
          
          // Perform cascading delete of all related data
          const result = performCascadingDelete(id);
          
          // Then perform the regular delete
          await get().deleteShow(id);
          
          reportInfo('store', 'Cascading delete completed', {
            showDeleted: id,
            ...result
          });
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
      setShows: (shows) => set({ shows }),
      
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
      addShowLegacy: (show) => set((state) => ({ shows: [...state.shows, show] })),
      updateShowLegacy: (show) => set((state) => ({
        shows: state.shows.map((s) => s.id === show.id ? show : s),
      })),
      
      removeShow: (id) => set((state) => {
        reportWarning('store', `Simple delete for show ${id} - Related data may become orphaned! Use deleteShowCascading() for safe deletion with cleanup`);
        
        return {
          shows: state.shows.filter((s) => s.id !== id),
        };
      }),

      removeShowCascading: (id) => set((state) => {
        reportInfo('store', 'Starting cascading delete for show', { showId: id });
        
        // Perform cascading delete of all related data
        const result = performCascadingDelete(id);
        
        // Remove the show itself
        const updatedShows = state.shows.filter((s) => s.id !== id);
        
        reportInfo('store', 'Cascading delete completed', {
          showDeleted: id,
          ...result
        });
        
        return {
          shows: updatedShows,
          selectedShowId: state.selectedShowId === id ? '' : state.selectedShowId
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
        const unsubscribe = replicatedShowsTable.subscribe((shows) => {
          const currentShows = get().shows;

          // Merge replicated data with existing local-only fields
          const mergedShows = shows.map(replicated => {
            const existing = currentShows.find(s => s.id === replicated.id);
            return mergeShowData(replicated, existing);
          });

          set({ shows: mergedShows });
          reportDebug('store', 'Shows updated from replicated table', { count: mergedShows.length });
        });

        set({ _unsubscribe: unsubscribe });

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
    })
);