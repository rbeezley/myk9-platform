import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import { mockShows } from '@/mockData/mockShows';
import { shouldUseMockData } from '@/config/dataSource';
import { performCascadingDelete, previewCascadingDelete, type CascadingDeletePreview } from '@/utils/cascadingDelete';
import { getOptimalStorage } from '@/services/database/storage-adapter';
// import { syncService } from '@/services/sync/syncService';
import { generateId } from '@/utils/idUtils';
import { getLastModifiedBy } from '@/utils/authHelpers';
import { reportStoreError, reportWarning, reportInfo, reportDebug } from '@/utils/standardizedErrorHandler';
import { useClubStore } from './clubStore';

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
}

export const useShowStore = create<ShowStore>()(
  persist(
    (set, get) => ({
      shows: shouldUseMockData('USE_MOCK_SHOWS') ? mockShows : [],
      selectedShowId: shouldUseMockData('USE_MOCK_SHOWS') ? mockShows[0]?.id || '' : '',
      isLoading: false,
      error: null,
      
      // Local-First Implementation
      addShow: async (showData: ShowInput): Promise<Show> => {
        try {
          set({ isLoading: true, error: null });
          
          // Generate optimistic ID and create show with sync metadata
          const optimisticId = generateId();
          const newShow: Show = {
            id: optimisticId,
            ...showData,
            stats: [], // Initialize empty stats
            trials: showData.trials || [],
            assignedJudges: showData.assignedJudges || [],
            
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending',
            _localOnly: false
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
          
          // Queue for background sync
          // TODO: Uncomment for Phase 2 cloud sync
          /*
          try {
            await syncService.addToQueue({
              entityType: 'shows',
              entityId: optimisticId,
              operation: 'create',
              data: showData as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            reportSyncError('queue', 'shows', optimisticId, syncError);
          }
          */
          
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
          
          // Create updated show with incremented version
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
          
          // Queue for background sync
          // TODO: Uncomment for Phase 2 cloud sync
          /*
          try {
            await syncService.addToQueue({
              entityType: 'shows',
              entityId: id,
              operation: 'update',
              data: updates as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            reportSyncError('queue', 'shows', id, syncError);
          }
          */
          
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
          
          // Optimistic delete - remove immediately
          set((state) => ({
            shows: state.shows.filter(s => s.id !== id),
            isLoading: false,
            // Clear selection if deleted show was selected
            selectedShowId: state.selectedShowId === id ? '' : state.selectedShowId
          }));
          
          // Queue for background sync
          // TODO: Uncomment for Phase 2 cloud sync
          /*
          try {
            await syncService.addToQueue({
              entityType: 'shows',
              entityId: id,
              operation: 'delete',
              data: {},
              priority: "medium"
            });
          } catch (syncError) {
            reportSyncError('queue', 'shows', id, syncError);
          }
          */
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
            // TODO: Implement actual data loading from IndexedDB/Supabase
            // For now, keep existing shows and just clear loading state
            set({ isLoading: false });
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
    }),
    {
      name: 'myk9show-shows-storage',
      storage: createJSONStorage(() => getOptimalStorage('shows')),
      partialize: (state) => ({
        shows: state.shows,
        selectedShowId: state.selectedShowId,
      }),
      onRehydrateStorage: () => (state) => {
        // Check for duplicate IDs and force reset if found
        if (state && state.shows.length > 0) {
          const ids = state.shows.map((show: Show) => show.id);
          const uniqueIds = new Set(ids);
          
          if (ids.length !== uniqueIds.size) {
            reportWarning('store', 'Duplicate show IDs detected! Forcing localStorage reset', { duplicateCount: ids.length - uniqueIds.size });
            // Clear duplicate shows instead of restoring mock data
            state.shows = [];
            state.selectedShowId = '';
            
            // Also clear the wizard storage to prevent conflicts
            try {
              localStorage.removeItem('show-wizard-storage');
            } catch (e) {
              reportWarning('store', 'Could not clear wizard storage', { error: e });
            }
            
            return;
          }
        }
        
        // No automatic mock data restoration - starting with clean data
      },
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for shows
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.shows && Array.isArray(state.shows)) {
              // Ensure all shows have proper club relationships
              state.shows = state.shows.map((show: unknown) => {
                const s = show as Record<string, unknown>;
                return {
                  ...s,
                  // Add any data transformations needed for relationships
                };
              });
            }
          }
        }
        return persistedState;
      },
    }
  )
);