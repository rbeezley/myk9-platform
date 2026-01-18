import { create } from 'zustand';
import type { Trial, TrialClass } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';

// Re-export types for external usage
export type { Trial, TrialClass };
import { replicatedTrialsTable, type ReplicatedTrial } from '@/services/replication';
import { reportDebug } from '@/utils/standardizedErrorHandler';

// Extend Trial interface with sync metadata
export interface SyncableTrial extends Trial {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

export interface SyncableTrialClass extends TrialClass {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

// Input types for creating/updating trials
export interface TrialInput {
  // Allow id for update scenarios where full Trial object is passed
  id?: string | undefined;
  showId: string;
  showName: string;
  name: string;
  trialDate: string;
  trialNumber: string;
  status: ClassStatusValue;
  eventNumber?: string | undefined;
  type?: string | undefined;
  trialType?: string | undefined;
  plannedStartTime?: string | undefined;
  order?: string | undefined;
  // Additional fields from Trial interface for updates
  image?: string | undefined;
  timeStarted?: string | undefined;
  timeEnded?: string | undefined;
  // Classes associated with this trial
  classes?: Array<{
    id: string;
    element: string;
    level: string;
    section: string;
    judgeId: string;
    judgeName?: string | undefined;
    startTime: string;
    status: ClassStatusValue;
    entries: number;
  }> | undefined;
}

export interface TrialClassInput {
  element: string;
  level: string;
  section: string;
  judgeId: string;
  judgeName?: string | undefined;
  startTime: string;
  status: ClassStatusValue;
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

  // Subscription Management (for replicated table sync)
  _unsubscribe: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;
}

// Import global mock data configuration
import { shouldUseMockData } from '@/config/dataSource';

const shouldUseMockTrials = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Trials are part of shows
};

/**
 * Convert ReplicatedTrial (database schema) to SyncableTrial (app schema)
 * Local-only fields are initialized to defaults
 */
function replicatedToTrial(replicated: ReplicatedTrial): SyncableTrial {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    showName: '', // Local-only: derived from show
    name: replicated.name,
    trialDate: replicated.date,
    trialNumber: replicated.trialNumber || '',
    status: (replicated.status as SyncableTrial['status']) || 'Upcoming',
    eventNumber: '', // Local-only
    type: '', // Local-only
    trialType: '', // Local-only
    plannedStartTime: '', // Local-only
    order: '', // Local-only
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated trial data with existing local trial data
 * Preserves local-only fields
 */
function mergeTrialData(replicated: ReplicatedTrial, existing: SyncableTrial | undefined): SyncableTrial {
  const base = replicatedToTrial(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields from existing
    showName: existing.showName || '',
    eventNumber: existing.eventNumber || '',
    type: existing.type || '',
    trialType: existing.trialType || '',
    plannedStartTime: existing.plannedStartTime || '',
    order: existing.order || '',
  };
}

export const useTrialStore = create<TrialStore>()(
  (set, get) => ({
    // Initial state
    trials: shouldUseMockTrials() ? mockTrials : [],
    selectedTrialId: shouldUseMockTrials() ? mockTrials[0]?.id || null : null,
    trialClasses: {},
    isLoading: false,
    error: null,
    _unsubscribe: null,

      // Local-First Implementation
      addTrial: async (trialData: TrialInput): Promise<SyncableTrial> => {
        try {
          set({ isLoading: true, error: null });

          // Create in replicated table (handles ID generation and sync)
          const id = crypto.randomUUID();
          const replicatedTrial: ReplicatedTrial = {
            id,
            showId: trialData.showId,
            name: trialData.name,
            date: trialData.trialDate,
            trialNumber: trialData.trialNumber,
            status: trialData.status,
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending',
            _localOnly: true,
          };

          await replicatedTrialsTable.set(id, replicatedTrial, true);

          // Create full SyncableTrial with local-only fields
          const newTrial: SyncableTrial = {
            ...replicatedToTrial(replicatedTrial),
            showName: trialData.showName || '',
            eventNumber: trialData.eventNumber || '',
            type: trialData.type || '',
            trialType: trialData.trialType || '',
            plannedStartTime: trialData.plannedStartTime || '',
            order: trialData.order || '',
          };

          // Optimistic update - add to store immediately
          set((state) => ({
            trials: [...state.trials, newTrial],
            selectedTrialId: id,
            isLoading: false
          }));

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

          // Get current replicated data and update
          const currentReplicated = await replicatedTrialsTable.get(id);
          // Build update object with only defined values to satisfy exactOptionalPropertyTypes
          const replicatedUpdates: Partial<ReplicatedTrial> = {
            _lastModified: new Date(),
            _syncStatus: 'pending',
          };
          if (updates.showId !== undefined) replicatedUpdates.showId = updates.showId;
          if (updates.name !== undefined) replicatedUpdates.name = updates.name;
          if (updates.trialDate !== undefined) replicatedUpdates.date = updates.trialDate;
          if (updates.trialNumber !== undefined) replicatedUpdates.trialNumber = updates.trialNumber;
          if (updates.status !== undefined) replicatedUpdates.status = updates.status;

          if (currentReplicated) {
            const updatedReplicated = {
              ...currentReplicated,
              ...replicatedUpdates,
              _version: (currentReplicated._version || 0) + 1,
            };
            await replicatedTrialsTable.set(id, updatedReplicated, true);
          }

          // Create updated trial with incremented version
          // Filter out undefined values from updates to satisfy exactOptionalPropertyTypes
          const definedUpdates: Partial<SyncableTrial> = {};
          if (updates.showId !== undefined) definedUpdates.showId = updates.showId;
          if (updates.showName !== undefined) definedUpdates.showName = updates.showName;
          if (updates.name !== undefined) definedUpdates.name = updates.name;
          if (updates.trialDate !== undefined) definedUpdates.trialDate = updates.trialDate;
          if (updates.trialNumber !== undefined) definedUpdates.trialNumber = updates.trialNumber;
          if (updates.status !== undefined) definedUpdates.status = updates.status;
          if (updates.eventNumber !== undefined) definedUpdates.eventNumber = updates.eventNumber;
          if (updates.type !== undefined) definedUpdates.type = updates.type;
          if (updates.trialType !== undefined) definedUpdates.trialType = updates.trialType;
          if (updates.plannedStartTime !== undefined) definedUpdates.plannedStartTime = updates.plannedStartTime;
          if (updates.order !== undefined) definedUpdates.order = updates.order;
          if (updates.image !== undefined) definedUpdates.image = updates.image;
          if (updates.timeStarted !== undefined) definedUpdates.timeStarted = updates.timeStarted;
          if (updates.timeEnded !== undefined) definedUpdates.timeEnded = updates.timeEnded;

          const updatedTrial: SyncableTrial = {
            ...currentTrial,
            ...definedUpdates,
            _version: currentTrial._version ? currentTrial._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending'
          };

          // Optimistic update
          set((state) => ({
            trials: state.trials.map(t => t.id === id ? updatedTrial : t),
            isLoading: false
          }));

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

          // Delete from replicated table
          await replicatedTrialsTable.delete(id);

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

          if (shouldUseMockTrials()) {
            set({ trials: mockTrials, isLoading: false });
          } else {
            // Load from replicated table (IndexedDB)
            const replicatedTrials = await replicatedTrialsTable.getAll();
            const currentTrials = get().trials;

            // Merge replicated data with existing local-only fields
            const mergedTrials = replicatedTrials.map(replicated => {
              const existing = currentTrials.find(t => t.id === replicated.id);
              return mergeTrialData(replicated, existing);
            });

            set({ trials: mergedTrials, isLoading: false });
            reportDebug('store', 'Loaded trials from replicated table', { count: mergedTrials.length });
          }
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

          // Generate ID and create trial class with sync metadata
          const id = crypto.randomUUID();
          const newTrialClass: SyncableTrialClass = {
            id,
            ...trialClassData,
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending',
            _localOnly: true
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

          // TODO: Integrate with ReplicatedClassesTable in future migration

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
            _version: currentClass._version ? currentClass._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
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

          // TODO: Integrate with ReplicatedClassesTable in future migration

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

          // TODO: Integrate with ReplicatedClassesTable in future migration
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
      }),

      // Subscription Management
      initializeSubscription: () => {
        // Skip if already subscribed or using mock data
        if (get()._unsubscribe || shouldUseMockTrials()) {
          return;
        }

        reportDebug('store', 'Initializing replicated table subscription for trials');

        // Subscribe to replicated table changes
        const unsubscribe = replicatedTrialsTable.subscribe((trials) => {
          const currentTrials = get().trials;

          // Merge replicated data with existing local-only fields
          const mergedTrials = trials.map(replicated => {
            const existing = currentTrials.find(t => t.id === replicated.id);
            return mergeTrialData(replicated, existing);
          });

          set({ trials: mergedTrials });
          reportDebug('store', 'Trials updated from replicated table', { count: mergedTrials.length });
        });

        set({ _unsubscribe: unsubscribe });

        // Load initial data
        get().loadTrials();
      },

      cleanup: () => {
        const unsubscribe = get()._unsubscribe;
        if (unsubscribe) {
          unsubscribe();
          set({ _unsubscribe: null });
          reportDebug('store', 'Cleaned up replicated table subscription for trials');
        }
      },
    })
);
