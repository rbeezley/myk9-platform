import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Dog } from '@/types/dog-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';

// Phase 2.1: Database Integration - Migrating from mock data to React Query
// Note: Data operations now delegated to React Query hooks via useDogStoreCompat
// This store now primarily manages UI state and provides backward compatibility

// Input types for creating/updating dogs
export interface DogInput {
  name: string;
  callName?: string; // Optional call name (nickname)
  breed: string;
  birthDate?: string;
  sex: 'male' | 'female';
  color?: string;
  weight?: number;
  height?: number;
  ownerId: string;
  ownerName?: string;
  microchipNumber?: string;
  imageUrl?: string;
  registrations?: Array<{
    organization: string;
    number: string;
    type: string;
    status: string;
  }>;
  healthRecords?: {
    vaccinations?: Array<{
      id: string;
      name: string;
      date: string;
      nextDue?: string;
      veterinarian: string;
    }>;
    medications?: Array<{
      id: string;
      name: string;
      dosage: string;
      frequency: string;
      startDate: string;
      endDate?: string;
    }>;
    allergies?: Array<{
      id: string;
      allergen: string;
      severity: string;
      reaction: string;
      notes?: string;
    }>;
  };
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
        console.warn('⚠️ dogStore.addDog is deprecated. Use useDogStoreCompat hook instead.');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },
      
      updateDog: async (): Promise<Dog | null> => {
        console.warn('⚠️ dogStore.updateDog is deprecated. Use useDogStoreCompat hook instead.');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },
      
      deleteDog: async (): Promise<void> => {
        console.warn('⚠️ dogStore.deleteDog is deprecated. Use useDogStoreCompat hook instead.');
        throw new Error('dogStore data operations are deprecated. Use useDogStoreCompat hook for data operations.');
      },
      
      getDogById: (): Dog | null => {
        console.warn('⚠️ dogStore.getDogById is deprecated. Use useDogStoreCompat hook instead.');
        return null;
      },
      
      getDogsByOwner: (): Dog[] => {
        console.warn('⚠️ dogStore.getDogsByOwner is deprecated. Use useDogStoreCompat hook instead.');
        return [];
      },
      
      getSyncStatus: (): 'synced' | 'pending' | 'error' | 'conflict' => {
        console.warn('⚠️ dogStore.getSyncStatus is deprecated. Use useDogStoreCompat hook instead.');
        return 'synced';
      },
      
      // Legacy methods (deprecated)
      addDogLegacy: () => {
        console.warn('⚠️ dogStore.addDogLegacy is deprecated and no longer functional.');
      },
      updateDogLegacy: () => {
        console.warn('⚠️ dogStore.updateDogLegacy is deprecated and no longer functional.');
      },
      removeDog: () => {
        console.warn('⚠️ dogStore.removeDog is deprecated and no longer functional.');
      },
      setDogs: () => {
        console.warn('⚠️ dogStore.setDogs is deprecated and no longer functional.');
      },
      loadDogs: async (): Promise<void> => {
        console.warn('⚠️ dogStore.loadDogs is deprecated and no longer functional.');
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
