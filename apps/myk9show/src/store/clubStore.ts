import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { Club } from '@/types/club-types';

export interface ClubInput {
  name: string;
  clubNumber: string;
  email: string;
  phone: string;
  website?: string;
  description: string;
  logo: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  founded?: Date;
  clubType?: 'specialty' | 'all-breed' | 'local' | 'regional' | 'national';
  memberIds?: string[];
}

export interface ClubStoreState {
  clubs: Club[];
  selectedClubId: string;
  isLoading: boolean;
  error: string | null;
  setClubs: (clubs: Club[]) => void;
  loadClubs: () => Promise<void>;
  selectClub: (id: string) => void;
  updateClub: (updatedClub: Club) => Promise<void>;
  addClub: (newClub: Club) => void;
  addClubOptimistic: (clubInput: ClubInput) => Promise<string>;
  updateClubOptimistic: (clubId: string, updates: Partial<Club>) => Promise<void>;
  removeClub: (clubId: string) => void;
  removeClubOptimistic: (clubId: string, deletedBy?: string) => Promise<void>;
  getSyncStatus: (clubId: string) => 'synced' | 'pending' | 'error' | 'conflict';
  hasPendingChanges: () => boolean;
}

// Helper function to ensure club has valid arrays
const ensureClubArrays = (club: Club): Club => ({
  ...club,
  upcomingShows: Array.isArray(club.upcomingShows) ? club.upcomingShows : [],
  pastShows: Array.isArray(club.pastShows) ? club.pastShows : []
});

export const useClubStore = create<ClubStoreState>()(
  persist(
    (set, get) => ({
      clubs: [],
      selectedClubId: '',
      isLoading: false,
      error: null,
      setClubs: (clubs: Club[]) => set({ clubs: clubs.map(ensureClubArrays) }),
      
      loadClubs: async (): Promise<void> => {
        try {
          set({ isLoading: true, error: null });
          
          // Import here to avoid circular dependencies
          const { getAllClubs } = await import('@/services/database/queries/clubQueries');
          const { mapDatabaseToClub } = await import('@/services/mappers/clubMappers');
          
          const { data, error } = await getAllClubs();
          
          if (error) {
            throw error;
          }
          
          // Map database results to Club objects
          const clubs = data.map(mapDatabaseToClub);
          
          console.log(`🏛️ Loaded ${clubs.length} clubs from database:`, 
            clubs.map(c => ({ 
              id: c.id, 
              name: c.name,
              idType: typeof c.id,
              isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.id)
            }))
          );
          
          set({ 
            clubs: clubs.map(ensureClubArrays),
            isLoading: false,
            error: null 
          });
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load clubs';
          console.error('💥 Failed to load clubs:', error);
          set({ error: errorMessage, isLoading: false });
        }
      },
      selectClub: (id: string) => set({ selectedClubId: id }),
      updateClub: async (updatedClub: Club) => {
        // Ensure arrays exist on the updated club
        const safeUpdatedClub: Club = {
          ...updatedClub,
          upcomingShows: updatedClub.upcomingShows || [],
          pastShows: updatedClub.pastShows || []
        };
        
        console.log('🏛️ ClubStore.updateClub called:', {
          clubId: safeUpdatedClub.id,
          clubName: safeUpdatedClub.name,
          phone: safeUpdatedClub.phone
        });
        
        // Update local state immediately (optimistic update)
        set((state) => {
          const updatedClubs = state.clubs.map((club) => club.id === safeUpdatedClub.id ? safeUpdatedClub : club);
          console.log('🏛️ ClubStore state after local update:', {
            totalClubs: updatedClubs.length,
            updatedClub: updatedClubs.find(c => c.id === safeUpdatedClub.id)?.name,
            updatedClubPhone: updatedClubs.find(c => c.id === safeUpdatedClub.id)?.phone
          });
          return { clubs: updatedClubs };
        });

        // Persist to database
        try {
          const { updateClub: updateClubInDB } = await import('@/services/database/queries/clubQueries');
          const { mapClubToUpdate } = await import('@/services/mappers/clubMappers');
          
          const dbUpdateData = mapClubToUpdate(safeUpdatedClub);
          console.log('🏛️ Saving club to database:', { 
            clubId: safeUpdatedClub.id, 
            clubIdType: typeof safeUpdatedClub.id,
            clubIdLength: safeUpdatedClub.id.length,
            isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeUpdatedClub.id),
            updateData: dbUpdateData 
          });
          
          const { data, error } = await updateClubInDB(safeUpdatedClub.id, dbUpdateData);
          
          if (error) {
            console.error('💥 Failed to save club to database:', {
              error,
              errorMessage: error.message,
              errorCode: error.code,
              errorDetails: error.details,
              clubId: safeUpdatedClub.id
            });
            // TODO: Show error toast to user
            // For now, the optimistic update stays in place
            // In a real app, you might want to revert the local change or show a retry option
            set({ error: error.message });
          } else {
            console.log('✅ Club saved to database successfully:', data);
            set({ error: null });
          }
          
        } catch (error) {
          console.error('💥 Exception while saving club:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to save club';
          set({ error: errorMessage });
        }
      },
      addClub: (newClub: Club) => set((state) => ({
        clubs: [...state.clubs, ensureClubArrays(newClub)]
      })),
      
      // Local-First optimistic operations
      addClubOptimistic: async (clubInput: ClubInput): Promise<string> => {
        // 1. Generate optimistic ID
        const optimisticId = `club-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // 2. Create club with sync metadata
        const newClub: Club = {
          ...clubInput,
          id: optimisticId,
          upcomingShows: [],
          pastShows: [],
          // Sync metadata
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'current-user', // TODO: Get from auth context
          _syncStatus: 'pending',
          _localOnly: false
        };
        
        // 3. Add to local store immediately
        set((state) => ({
          clubs: [...state.clubs, newClub]
        }));
        
        // 4. Queue sync action
        // TODO: Uncomment for Phase 2 cloud sync
        /*
        try {
          const { syncService } = await import('@/services/sync/syncService');
          await syncService.addToQueue({
            entityType: 'clubs',
            entityId: optimisticId,
            operation: 'create',
            data: newClub as unknown as Record<string, unknown>,
            priority: "medium"
          });
        } catch (error) {
          console.error('Failed to queue club creation:', error);
          // Mark as error but keep in local store
          set((state) => ({
            clubs: state.clubs.map(club => 
              club.id === optimisticId 
                ? { ...club, _syncStatus: 'error' as const }
                : club
            )
          }));
        }
        */
        
        // 5. Return optimistic ID
        return optimisticId;
      },

      updateClubOptimistic: async (clubId: string, updates: Partial<Club>): Promise<void> => {
        const state = get();
        const existingClub = state.clubs.find(club => club.id === clubId);
        
        if (!existingClub) {
          throw new Error(`Club with id ${clubId} not found`);
        }

        // Create updated club with new sync metadata
        const updatedClub: Club = {
          ...existingClub,
          ...updates,
          _version: (existingClub._version || 1) + 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'current-user', // TODO: Get from auth context
          _syncStatus: 'pending'
        };

        // Update local store immediately
        set((state) => ({
          clubs: state.clubs.map(club => club.id === clubId ? updatedClub : club)
        }));

        // Queue sync action
        // TODO: Uncomment for Phase 2 cloud sync
        /*
        try {
          const { syncService } = await import('@/services/sync/syncService');
          await syncService.addToQueue({
            entityType: 'clubs',
            entityId: clubId,
            operation: 'update',
            data: updatedClub as unknown as Record<string, unknown>,
            priority: "medium"
          });
        } catch (error) {
          console.error('Failed to queue club update:', error);
          // Mark as error
          set((state) => ({
            clubs: state.clubs.map(club => 
              club.id === clubId 
                ? { ...club, _syncStatus: 'error' as const }
                : club
            )
          }));
        }
        */
      },

      removeClub: (clubId: string) => set((state) => ({
        clubs: state.clubs.filter((club) => club.id !== clubId),
        selectedClubId: state.selectedClubId === clubId ? (state.clubs[0]?.id || '') : state.selectedClubId
      })),

      removeClubOptimistic: async (clubId: string, deletedBy?: string): Promise<void> => {
        const state = get();
        const clubToDelete = state.clubs.find(club => club.id === clubId);
        
        if (!clubToDelete) {
          throw new Error(`Club with id ${clubId} not found`);
        }

        console.log('🗑️ ClubStore.removeClubOptimistic called:', {
          clubId,
          clubName: clubToDelete.name,
          deletedBy
        });

        try {
          // Delete from database first
          const { deleteClub } = await import('@/services/database/queries/clubQueries');
          const { data, error } = await deleteClub(clubId, deletedBy);
          
          if (error) {
            console.error('💥 Failed to delete club from database:', error);
            throw error;
          }

          console.log('✅ Club deleted from database successfully:', data);
          
          // Remove from local store after successful database deletion
          set((state) => ({
            clubs: state.clubs.filter(club => club.id !== clubId),
            selectedClubId: state.selectedClubId === clubId ? (state.clubs[0]?.id || '') : state.selectedClubId
          }));

        } catch (error) {
          console.error('💥 Exception while deleting club:', error);
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete club';
          set({ error: errorMessage });
          throw error; // Re-throw to let the UI handle the error
        }
      },

      getSyncStatus: (clubId: string): 'synced' | 'pending' | 'error' | 'conflict' => {
        const club = get().clubs.find(c => c.id === clubId);
        return club?._syncStatus || 'synced';
      },

      hasPendingChanges: (): boolean => {
        const clubs = get().clubs;
        return clubs.some(club => 
          club._syncStatus === 'pending' || 
          club._syncStatus === 'error' || 
          club._syncStatus === 'conflict'
        );
      },
    }),
    {
      name: 'club-store-v4', // CRITICAL FIX: Force complete reset to fix undefined arrays
      storage: createJSONStorage(() => getOptimalStorage('clubs')),
      partialize: (state: ClubStoreState) => ({ 
        clubs: state.clubs,
        selectedClubId: state.selectedClubId 
      }),
      onRehydrateStorage: () => (state) => {
        // Store should remain empty unless user explicitly adds data
        // No automatic mock data restoration
        if (state) {
          // FORCE fix for undefined arrays - this is critical for functionality
          state.clubs = state.clubs.map(club => {
            const fixedClub = {
              ...club,
              founded: club.founded ? new Date(club.founded) : undefined,
              upcomingShows: Array.isArray(club.upcomingShows) ? club.upcomingShows : [],
              pastShows: Array.isArray(club.pastShows) ? club.pastShows : []
            };
            if (!Array.isArray(club.upcomingShows) || !Array.isArray(club.pastShows)) {
              console.log('🔧 FIXED missing arrays for club:', club.name, {
                upcomingShows: club.upcomingShows,
                pastShows: club.pastShows,
                fixedUpcoming: fixedClub.upcomingShows,
                fixedPast: fixedClub.pastShows
              });
            }
            return fixedClub;
          });
          console.log('🔧 ClubStore rehydrated - processed', state.clubs.length, 'clubs');
        }
      },
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0 || version === 1 || version === 2) {
          // Fix missing show arrays in existing clubs
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as { clubs?: Record<string, unknown>[] };
            if (state.clubs && Array.isArray(state.clubs)) {
              state.clubs = state.clubs.map(club => ({
                ...club,
                upcomingShows: club.upcomingShows || [],
                pastShows: club.pastShows || []
              }));
              console.log('🔧 Migration v' + version + '->v3: Fixed missing show arrays for', state.clubs.length, 'clubs');
            }
          }
          return persistedState;
        }
        return persistedState;
      },
    }
  )
);
