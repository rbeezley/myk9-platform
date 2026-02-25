import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Dog } from '@/types/dog-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';

// Phase 2.1: Database Integration - Migrating from mock data to React Query
// Note: Data operations now delegated to React Query hooks via useDogStoreCompat
// This store now primarily manages UI state and provides backward compatibility

// Input types for creating/updating dogs
export interface DogInput {
  name: string;
  callName?: string | undefined; // Optional call name (nickname)
  breed: string;
  birthDate?: string | undefined;
  sex: 'male' | 'female';
  color?: string | undefined;
  weight?: number | undefined;
  height?: number | undefined;
  ownerId: string;
  ownerName?: string | undefined;
  microchipNumber?: string | undefined;
  imageUrl?: string | undefined;
  spayedNeutered?: boolean | undefined;
  registrations?: Array<{
    organization: string;
    number: string;
    registeredName?: string | undefined;
    type: string;
    status: string;
  }> | undefined;
  healthRecords?: {
    vaccinations?: Array<{
      id: string;
      name: string;
      date: string;
      nextDue?: string | undefined;
      veterinarian: string;
    }> | undefined;
    medications?: Array<{
      id: string;
      name: string;
      dosage: string;
      frequency: string;
      startDate: string;
      endDate?: string | undefined;
    }> | undefined;
    allergies?: Array<{
      id: string;
      allergen: string;
      severity: string;
      reaction: string;
      notes?: string | undefined;
    }> | undefined;
  } | undefined;
}

// Phase 2.1: Simplified DogStore interface for UI state management only
// Data operations are now handled by React Query hooks
interface DogStore {
  // UI State (persisted)
  selectedDogId: string;
  
  // Migration flags
  _migratedToReactQuery: boolean;
  _useReactQuery: boolean;
  
  // UI State Management
  selectDog: (id: string) => void;
  resetStore: () => void;
  
  // Backward compatibility: Data operations
  // Note: These are deprecated - components should use useDogStoreCompat hook instead
  dogs: Dog[];
  isLoading: boolean;
  error: string | null;
  addDog: (dogData: DogInput) => Promise<Dog>;
  updateDog: (id: string, updates: Partial<DogInput>) => Promise<Dog | null>;
  deleteDog: (id: string) => Promise<void>;
  getDogById: (id: string) => Dog | null;
  getDogsByOwner: (ownerId: string) => Dog[];
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';
  
  // Legacy methods (deprecated)
  addDogLegacy: (dog: Dog) => void;
  updateDogLegacy: (dog: Dog) => void;
  removeDog: (id: string) => void;
  setDogs: (dogs: Dog[]) => void;
  loadDogs: () => Promise<void>;
}

export const useDogStore = create<DogStore>()(
  persist(
    (set) => ({
      // UI State (persisted)
      selectedDogId: '',
      
      // Migration flags
      _migratedToReactQuery: true,
      _useReactQuery: true,
      
      // UI State Management
      selectDog: (id: string) => set({ selectedDogId: id }),
      
      resetStore: () => set({
        selectedDogId: '',
      }),
      
      // Backward compatibility: Data operations (deprecated)
      // These methods now throw errors to encourage migration to useDogStoreCompat
      dogs: [],
      isLoading: false,
      error: null,
      
      addDog: async (): Promise<Dog> => {
        logger.warn('dogStore.addDog is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },

      updateDog: async (): Promise<Dog | null> => {
        logger.warn('dogStore.updateDog is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },

      deleteDog: async (): Promise<void> => {
        logger.warn('dogStore.deleteDog is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },

      getDogById: (): Dog | null => {
        logger.warn('dogStore.getDogById is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        return null;
      },

      getDogsByOwner: (): Dog[] => {
        logger.warn('dogStore.getDogsByOwner is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        return [];
      },

      getSyncStatus: (): 'synced' | 'pending' | 'error' | 'conflict' => {
        logger.warn('dogStore.getSyncStatus is deprecated. Use useDogStoreCompat hook instead', 'dogs');
        return 'synced';
      },

      // Legacy methods (deprecated)
      addDogLegacy: () => {
        logger.warn('dogStore.addDogLegacy is deprecated and no longer functional', 'dogs');
      },
      updateDogLegacy: () => {
        logger.warn('dogStore.updateDogLegacy is deprecated and no longer functional', 'dogs');
      },
      removeDog: () => {
        logger.warn('dogStore.removeDog is deprecated and no longer functional', 'dogs');
      },
      setDogs: () => {
        logger.warn('dogStore.setDogs is deprecated and no longer functional', 'dogs');
      },
      loadDogs: async (): Promise<void> => {
        logger.warn('dogStore.loadDogs is deprecated and no longer functional', 'dogs');
      },
    }),
    {
      name: 'myk9show-dogs-ui-storage',
      storage: createJSONStorage(() => getOptimalStorage('dogs')),
      partialize: (state) => ({
        selectedDogId: state.selectedDogId,
        _migratedToReactQuery: state._migratedToReactQuery,
        _useReactQuery: state._useReactQuery,
      }),
      version: 2, // Increment version to indicate React Query migration
      migrate: (persistedState: unknown, version: number) => {
        // Migration from version 1 (localStorage dogs) to version 2 (React Query)
        if (version < 2) {
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            // Clear old dogs data, keep only UI state
            return {
              selectedDogId: state.selectedDogId || '',
              _migratedToReactQuery: true,
              _useReactQuery: true,
            };
          }
        }
        return persistedState;
      },
    }
  )
);
