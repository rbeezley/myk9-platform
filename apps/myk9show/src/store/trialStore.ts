import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Trial, TrialClass } from '@/components/trials/types/trial.types';

// Re-export types for external usage
export type { Trial, TrialClass };
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { syncService } from '@/services/sync/syncService';
import { generateId } from '@/utils/idUtils';

// Extend Trial interface with sync metadata
export interface SyncableTrial extends Trial {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export interface SyncableTrialClass extends TrialClass {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

// Input types for creating/updating trials
export interface TrialInput {
  showId: string;
  showName: string;
  name: string;
  trialDate: string;
  trialNumber: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  eventNumber?: string;
  type?: string;
  trialType?: string;
  plannedStartTime?: string;
  order?: string;
}

export interface TrialClassInput {
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string;
  startTime: string;
  status: 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled';
  entries: number;
}

// Mock data for initial state
const mockTrials: SyncableTrial[] = [
  {
    id: '1',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Interior Search',
    trialDate: '2025-07-20',
    trialNumber: 'T-2025-001',
    status: 'Upcoming',
    eventNumber: 'EV-2025-001',
    type: 'Interior Search',
    trialType: 'Scent Work',
    plannedStartTime: '09:00 AM',
    order: '1',
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '2',
    showId: '1',
    showName: 'Summer Specialty Show',
    name: 'Scent Work Exterior Search',
    trialDate: '2025-07-21',
    trialNumber: 'T-2025-002',
    status: 'Upcoming',
    eventNumber: 'EV-2025-045',
    type: 'Exterior Search',
    trialType: 'Scent Work',
    plannedStartTime: '10:30 AM',
    order: '2',
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '3',
    showId: '2',
    showName: 'Fall Agility Championship',
    name: 'Standard Agility',
    trialDate: '2025-10-15',
    trialNumber: 'TR-2025-003',
    status: 'Upcoming',
    eventNumber: 'EV-2025-003',
    type: 'Standard',
    trialType: 'Agility',
    plannedStartTime: '11:00 AM',
    order: '3',
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '4',
    showId: '4',
    showName: 'Summer Nosework Trial',
    name: 'Nosework Elements Trial',
    trialDate: '2025-08-10',
    trialNumber: 'TR-2025-004',
    status: 'Upcoming',
    eventNumber: 'EV-2025-004',
    type: 'Element Search',
    trialType: 'Nosework',
    plannedStartTime: '09:00 AM',
    order: '1',
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '5',
    showId: '5',
    showName: 'Fall Obedience & Rally Championship',
    name: 'Obedience & Rally Combined Trial',
    trialDate: '2025-09-25',
    trialNumber: 'TR-2025-005',
    status: 'Upcoming',
    eventNumber: 'EV-2025-005',
    type: 'Combined Trial',
    trialType: 'Obedience & Rally',
    plannedStartTime: '08:30 AM',
    order: '1',
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  }
];

interface TrialStore {
  // Trials
  trials: SyncableTrial[];
  selectedTrialId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Local-First Trial Actions
  addTrial: (trialData: TrialInput) => Promise<SyncableTrial>;
  updateTrial: (id: string, updates: Partial<TrialInput>) => Promise<SyncableTrial | null>;
  deleteTrial: (id: string) => Promise<void>;
  getTrialById: (id: string) => SyncableTrial | null;
  getTrialsByShow: (showId: string) => SyncableTrial[];
  
  // Data Management
  setTrials: (trials: SyncableTrial[]) => void;
  loadTrials: () => Promise<void>;
  
  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';
  
  // Legacy methods for compatibility
  addTrialLegacy: (trial: Omit<Trial, 'id'>) => void;
  updateTrialLegacy: (trial: Partial<Trial> & { id: string }) => void;
  removeTrial: (id: string) => void;
  selectTrial: (id: string | null) => void;
  
  // Trial Classes
  trialClasses: Record<string, SyncableTrialClass[]>; // Maps trialId to its classes
  addTrialClass: (trialId: string, trialClassData: TrialClassInput) => Promise<SyncableTrialClass>;
  updateTrialClass: (trialId: string, classId: string, updates: Partial<TrialClassInput>) => Promise<SyncableTrialClass | null>;
  deleteTrialClass: (trialId: string, classId: string) => Promise<void>;
  getTrialClassesByTrial: (trialId: string) => SyncableTrialClass[];
  
  // Legacy Trial Class methods
  addTrialClassLegacy: (trialId: string, trialClass: Omit<TrialClass, 'id'>) => void;
  updateTrialClassLegacy: (trialId: string, trialClass: TrialClass) => void;
  removeTrialClass: (trialId: string, classId: string) => void;
}

// Import global mock data configuration
import { shouldUseMockData } from '@/config/dataSource';

const shouldUseMockTrials = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Trials are part of shows
};

export const useTrialStore = create<TrialStore>()(
  persist(
    (set, get) => ({
      // Initial state
      trials: shouldUseMockTrials() ? mockTrials : [],
      selectedTrialId: shouldUseMockTrials() ? mockTrials[0]?.id || null : null,
      trialClasses: {},
      isLoading: false,
      error: null,

      // Local-First Implementation
      addTrial: async (trialData: TrialInput): Promise<SyncableTrial> => {
        try {
          set({ isLoading: true, error: null });
          
          // Generate optimistic ID and create trial with sync metadata
          const optimisticId = generateId();
          const newTrial: SyncableTrial = {
            id: optimisticId,
            ...trialData,
            
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user', // TODO: Get from auth context
            _syncStatus: 'pending',
            _localOnly: false
          };
          
          // Optimistic update - add to store immediately
          set((state) => ({
            trials: [...state.trials, newTrial],
            selectedTrialId: optimisticId,
            isLoading: false
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trials',
              entityId: optimisticId,
              operation: 'create',
              data: trialData as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial creation for sync:', syncError);
          }
          
          return newTrial;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to add trial';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      updateTrial: async (id: string, updates: Partial<TrialInput>): Promise<SyncableTrial | null> => {
        try {
          set({ isLoading: true, error: null });
          
          const currentTrial = get().trials.find(t => t.id === id);
          if (!currentTrial) {
            const error = `Trial with id ${id} not found`;
            set({ error, isLoading: false });
            return null;
          }
          
          // Create updated trial with incremented version
          const updatedTrial: SyncableTrial = {
            ...currentTrial,
            ...updates,
            
            // Update sync metadata
            _version: currentTrial._version ? currentTrial._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user', // TODO: Get from auth context
            _syncStatus: 'pending'
          };
          
          // Optimistic update
          set((state) => ({
            trials: state.trials.map(t => t.id === id ? updatedTrial : t),
            isLoading: false
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trials',
              entityId: id,
              operation: 'update',
              data: updates as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial update for sync:', syncError);
          }
          
          return updatedTrial;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update trial';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      deleteTrial: async (id: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });
          
          const trialExists = get().trials.some(t => t.id === id);
          if (!trialExists) {
            const error = `Trial with id ${id} not found`;
            set({ error, isLoading: false });
            return;
          }
          
          // Optimistic delete - remove immediately (including trial classes)
          set((state) => {
            const { [id]: _removed, ...remainingClasses } = state.trialClasses;
            void _removed; // Suppress unused variable warning
            return {
              trials: state.trials.filter(t => t.id !== id),
              trialClasses: remainingClasses,
              isLoading: false,
              // Clear selection if deleted trial was selected
              selectedTrialId: state.selectedTrialId === id ? null : state.selectedTrialId
            };
          });
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trials',
              entityId: id,
              operation: 'delete',
              data: {},
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial deletion for sync:', syncError);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete trial';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      getTrialById: (id: string): SyncableTrial | null => {
        return get().trials.find(t => t.id === id) || null;
      },
      
      getTrialsByShow: (showId: string): SyncableTrial[] => {
        return get().trials.filter(t => t.showId === showId);
      },
      
      // Data Management
      setTrials: (trials) => set({ trials }),
      
      loadTrials: async (): Promise<void> => {
        try {
          set({ isLoading: true, error: null });
          // TODO: Implement actual data loading from IndexedDB/API
          set({ isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load trials';
          set({ error: errorMessage, isLoading: false });
        }
      },
      
      // Sync Status
      getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
        const trial = get().trials.find(t => t.id === id);
        return trial?._syncStatus || 'synced';
      },
      
      // Legacy methods for compatibility
      addTrialLegacy: (trial) => set((state) => {
        const newId = String(Math.max(0, ...state.trials.map(t => parseInt(t.id))) + 1);
        const legacyTrial: SyncableTrial = {
          ...trial,
          id: newId,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'legacy-system',
          _syncStatus: 'synced',
          _localOnly: false
        };
        return { 
          trials: [...state.trials, legacyTrial],
          selectedTrialId: newId
        };
      }),
      
      updateTrialLegacy: (updatedTrial: Partial<Trial> & { id: string }) => 
        set((state) => {
          const newTrials = state.trials.map((trial) => {
            if (trial.id === updatedTrial.id) {
              return {
                ...trial,
                ...updatedTrial,
                _version: (trial._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: 'legacy-system',
                _syncStatus: 'pending' as const
              };
            }
            return trial;
          });
          console.log('trialStore: Trials after update:', JSON.stringify(newTrials, null, 2));
          return { trials: newTrials };
        }),
      
      removeTrial: (id) => set((state) => {
        const { [id]: _removed, ...remainingClasses } = state.trialClasses;
        void _removed; // Suppress unused variable warning
        return {
          trials: state.trials.filter((t) => t.id !== id),
          selectedTrialId: state.selectedTrialId === id ? null : state.selectedTrialId,
          trialClasses: remainingClasses
        };
      }),
      
      selectTrial: (id) => set({ selectedTrialId: id }),
      
      // Local-First Trial Class Implementation
      addTrialClass: async (trialId: string, trialClassData: TrialClassInput): Promise<SyncableTrialClass> => {
        try {
          const trial = get().trials.find(t => t.id === trialId);
          if (!trial) {
            throw new Error(`Trial with id ${trialId} not found`);
          }
          
          // Generate optimistic ID and create trial class with sync metadata
          const optimisticId = generateId();
          const newTrialClass: SyncableTrialClass = {
            id: optimisticId,
            ...trialClassData,
            
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user', // TODO: Get from auth context
            _syncStatus: 'pending',
            _localOnly: false
          };
          
          // Optimistic update - add to store immediately
          set((state) => {
            const classes = state.trialClasses[trialId] || [];
            return {
              trialClasses: {
                ...state.trialClasses,
                [trialId]: [...classes, newTrialClass]
              }
            };
          });
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trial_classes',
              entityId: optimisticId,
              operation: 'create',
              data: { ...trialClassData, trialId } as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial class creation for sync:', syncError);
          }
          
          return newTrialClass;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to add trial class';
          set({ error: errorMessage });
          throw error;
        }
      },
      
      updateTrialClass: async (trialId: string, classId: string, updates: Partial<TrialClassInput>): Promise<SyncableTrialClass | null> => {
        try {
          const classes = get().trialClasses[trialId] || [];
          const currentClass = classes.find(c => c.id === classId);
          
          if (!currentClass) {
            const error = `Trial class with id ${classId} not found in trial ${trialId}`;
            set({ error });
            return null;
          }
          
          // Create updated trial class with incremented version
          const updatedClass: SyncableTrialClass = {
            ...currentClass,
            ...updates,
            
            // Update sync metadata
            _version: currentClass._version ? currentClass._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user', // TODO: Get from auth context
            _syncStatus: 'pending'
          };
          
          // Optimistic update
          set((state) => ({
            trialClasses: {
              ...state.trialClasses,
              [trialId]: (state.trialClasses[trialId] || []).map(c => 
                c.id === classId ? updatedClass : c
              )
            }
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trial_classes',
              entityId: classId,
              operation: 'update',
              data: { ...updates, trialId } as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial class update for sync:', syncError);
          }
          
          return updatedClass;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update trial class';
          set({ error: errorMessage });
          throw error;
        }
      },
      
      deleteTrialClass: async (trialId: string, classId: string): Promise<void> => {
        try {
          const classes = get().trialClasses[trialId] || [];
          const classExists = classes.some(c => c.id === classId);
          
          if (!classExists) {
            const error = `Trial class with id ${classId} not found in trial ${trialId}`;
            set({ error });
            return;
          }
          
          // Optimistic delete - remove immediately
          set((state) => ({
            trialClasses: {
              ...state.trialClasses,
              [trialId]: (state.trialClasses[trialId] || []).filter(c => c.id !== classId)
            }
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'trial_classes',
              entityId: classId,
              operation: 'delete',
              data: { trialId },
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue trial class deletion for sync:', syncError);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete trial class';
          set({ error: errorMessage });
          throw error;
        }
      },
      
      getTrialClassesByTrial: (trialId: string): SyncableTrialClass[] => {
        return get().trialClasses[trialId] || [];
      },
      
      // Legacy Trial Class methods
      addTrialClassLegacy: (trialId, trialClass) => set((state) => {
        const trial = state.trials.find(t => t.id === trialId);
        if (!trial) return state;
        
        const classes = state.trialClasses[trialId] || [];
        const newId = String(Math.max(0, ...classes.map(c => parseInt(c.id))) + 1);
        
        const legacyClass: SyncableTrialClass = {
          ...trialClass,
          id: newId,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'legacy-system',
          _syncStatus: 'synced',
          _localOnly: false
        };
        
        return {
          trialClasses: {
            ...state.trialClasses,
            [trialId]: [...classes, legacyClass]
          }
        };
      }),
      
      updateTrialClassLegacy: (trialId, trialClass) => set((state) => {
        const classes = state.trialClasses[trialId] || [];
        return {
          trialClasses: {
            ...state.trialClasses,
            [trialId]: classes.map((c) => {
              if (c.id === trialClass.id) {
                return {
                  ...trialClass,
                  _version: (c._version || 1) + 1,
                  _lastModified: new Date(),
                  _lastModifiedBy: 'legacy-system',
                  _syncStatus: 'pending' as const,
                  _localOnly: false
                };
              }
              return c;
            })
          }
        };
      }),
      
      removeTrialClass: (trialId, classId) => set((state) => {
        const classes = state.trialClasses[trialId] || [];
        return {
          trialClasses: {
            ...state.trialClasses,
            [trialId]: classes.filter((c) => c.id !== classId)
          }
        };
      })
    }),
    {
      name: 'myk9show-trials-storage',
      storage: createJSONStorage(() => getOptimalStorage('trials')),
      partialize: (state) => ({
        trials: state.trials,
        selectedTrialId: state.selectedTrialId,
        trialClasses: state.trialClasses
      }),
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for trials
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.trials && Array.isArray(state.trials)) {
              // Ensure all trials have proper show relationships
              state.trials = state.trials.map((trial: unknown) => {
                const t = trial as Record<string, unknown>;
                return {
                  ...t,
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
