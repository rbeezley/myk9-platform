import { create } from 'zustand';
import {
  replicatedTrialsTable,
  replicatedClassesTable,
  type ReplicatedTrial,
} from '@/services/replication';
import { reportDebug } from '@/utils/standardizedErrorHandler';

import type {
  SyncableTrial,
  SyncableTrialClass,
  TrialInput,
  TrialClassInput,
  TrialStore,
  Trial,
} from './trial-store-types';

// Re-export types for external consumers
export type {
  Trial,
  TrialClass,
  SyncableTrial,
  SyncableTrialClass,
  TrialInput,
  TrialClassInput,
} from './trial-store-types';

import {
  trialClassToReplicated,
  mergeTrialClassData,
  replicatedToTrial,
  mergeTrialData,
  shouldUseMockTrials,
  mockTrials,
} from './trial-store-helpers';

export const useTrialStore = create<TrialStore>()((set, get) => ({
  // Initial state
  trials: shouldUseMockTrials() ? mockTrials : [],
  selectedTrialId: shouldUseMockTrials() ? mockTrials[0]?.id || null : null,
  trialClasses: {},
  isLoading: false,
  error: null,
  _unsubscribe: null,
  _unsubscribeClasses: null,

  // Local-First Implementation
  addTrial: async (trialData: TrialInput, userId: string): Promise<SyncableTrial> => {
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
        trialType: trialData.trialType,
        sportType: trialData.sportType,
        plannedStartTime: trialData.plannedStartTime,
        actualStartTime: trialData.timeStarted,
        actualEndTime: trialData.timeEnded,
        eventNumber: trialData.eventNumber,
        displayOrder: trialData.order ? parseInt(trialData.order, 10) : 0,
        category: trialData.type,
        imageUrl: trialData.image,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: userId,
        _syncStatus: 'pending',
        _localOnly: true,
      };

      const savedReplicated = await replicatedTrialsTable.createTrial(replicatedTrial);

      const newTrial: SyncableTrial = {
        ...replicatedToTrial(savedReplicated),
        showName: trialData.showName || '',
      };

      // Optimistic update - add to store immediately
      set(state => ({
        trials: [...state.trials, newTrial],
        selectedTrialId: id,
        isLoading: false,
      }));

      return newTrial;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add trial';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  updateTrial: async (
    id: string,
    updates: Partial<TrialInput>,
    userId: string
  ): Promise<SyncableTrial | null> => {
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
      if (updates.trialType !== undefined) replicatedUpdates.trialType = updates.trialType;
      if (updates.sportType !== undefined) replicatedUpdates.sportType = updates.sportType;
      if (updates.plannedStartTime !== undefined)
        replicatedUpdates.plannedStartTime = updates.plannedStartTime;
      if (updates.timeStarted !== undefined)
        replicatedUpdates.actualStartTime = updates.timeStarted;
      if (updates.timeEnded !== undefined) replicatedUpdates.actualEndTime = updates.timeEnded;
      if (updates.eventNumber !== undefined) replicatedUpdates.eventNumber = updates.eventNumber;
      if (updates.order !== undefined)
        replicatedUpdates.displayOrder = updates.order ? parseInt(updates.order, 10) : 0;
      if (updates.type !== undefined) replicatedUpdates.category = updates.type;
      if (updates.image !== undefined) replicatedUpdates.imageUrl = updates.image;

      if (currentReplicated) {
        await replicatedTrialsTable.updateTrial(id, {
          ...replicatedUpdates,
          _version: (currentReplicated._version || 0) + 1,
        });
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
      if (updates.plannedStartTime !== undefined)
        definedUpdates.plannedStartTime = updates.plannedStartTime;
      if (updates.order !== undefined) definedUpdates.order = updates.order;
      if (updates.image !== undefined) definedUpdates.image = updates.image;
      if (updates.timeStarted !== undefined) definedUpdates.timeStarted = updates.timeStarted;
      if (updates.timeEnded !== undefined) definedUpdates.timeEnded = updates.timeEnded;

      const updatedTrial: SyncableTrial = {
        ...currentTrial,
        ...definedUpdates,
        _version: currentTrial._version ? currentTrial._version + 1 : 1,
        _lastModified: new Date(),
        _lastModifiedBy: userId,
        _syncStatus: 'pending',
      };

      // Optimistic update
      set(state => ({
        trials: state.trials.map(t => (t.id === id ? updatedTrial : t)),
        isLoading: false,
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

      // Delete from replicated table and queue DELETE mutation for Supabase
      await replicatedTrialsTable.deleteTrial(id);

      // Optimistic delete - remove immediately (including trial classes)
      set(state => {
        const { [id]: _removed, ...remainingClasses } = state.trialClasses;
        void _removed; // Suppress unused variable warning
        return {
          trials: state.trials.filter(t => t.id !== id),
          trialClasses: remainingClasses,
          isLoading: false,
          // Clear selection if deleted trial was selected
          selectedTrialId: state.selectedTrialId === id ? null : state.selectedTrialId,
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
  setTrials: trials => set({ trials }),

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

  loadTrialClasses: async (): Promise<void> => {
    try {
      if (shouldUseMockTrials()) return;

      const allClasses = await replicatedClassesTable.getAll();
      const currentClasses = get().trialClasses;

      // Group classes by trialId, merging with existing local data
      const grouped: Record<string, SyncableTrialClass[]> = {};
      for (const replicated of allClasses) {
        const trialId = replicated.trialId || replicated.trial_id;
        if (!trialId) continue;

        const existing = currentClasses[trialId]?.find(c => c.id === replicated.id);
        const merged = mergeTrialClassData(replicated, existing);

        if (!grouped[trialId]) grouped[trialId] = [];
        grouped[trialId].push(merged);
      }

      set({ trialClasses: grouped });
      reportDebug('store', 'Loaded trial classes from replicated table', {
        trialCount: Object.keys(grouped).length,
        classCount: allClasses.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load trial classes';
      set({ error: errorMessage });
    }
  },

  // Sync Status
  getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
    const trial = get().trials.find(t => t.id === id);
    return trial?._syncStatus || 'synced';
  },

  // Legacy methods for compatibility
  addTrialLegacy: trial =>
    set(state => {
      const newId = String(Math.max(0, ...state.trials.map(t => parseInt(t.id, 10) || 0)) + 1);
      const legacyTrial: SyncableTrial = {
        ...trial,
        id: newId,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'legacy-system',
        _syncStatus: 'synced',
        _localOnly: false,
      };
      return {
        trials: [...state.trials, legacyTrial],
        selectedTrialId: newId,
      };
    }),

  updateTrialLegacy: (updatedTrial: Partial<Trial> & { id: string }) =>
    set(state => {
      const newTrials = state.trials.map(trial => {
        if (trial.id === updatedTrial.id) {
          return {
            ...trial,
            ...updatedTrial,
            _version: (trial._version || 1) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'legacy-system',
            _syncStatus: 'pending' as const,
          };
        }
        return trial;
      });
      return { trials: newTrials };
    }),

  removeTrial: id =>
    set(state => {
      const { [id]: _removed, ...remainingClasses } = state.trialClasses;
      void _removed; // Suppress unused variable warning
      return {
        trials: state.trials.filter(t => t.id !== id),
        selectedTrialId: state.selectedTrialId === id ? null : state.selectedTrialId,
        trialClasses: remainingClasses,
      };
    }),

  selectTrial: id => set({ selectedTrialId: id }),

  // Local-First Trial Class Implementation
  addTrialClass: async (
    trialId: string,
    trialClassData: TrialClassInput,
    userId: string
  ): Promise<SyncableTrialClass> => {
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
        _lastModifiedBy: userId,
        _syncStatus: 'pending',
        _localOnly: true,
      };

      // Persist first, then update state (matches addTrial/classStore pattern)
      await replicatedClassesTable.set(
        newTrialClass.id,
        trialClassToReplicated(newTrialClass, trialId),
        true
      );

      set(state => {
        const classes = state.trialClasses[trialId] || [];
        return {
          trialClasses: {
            ...state.trialClasses,
            [trialId]: [...classes, newTrialClass],
          },
        };
      });

      return newTrialClass;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add trial class';
      set({ error: errorMessage });
      throw error;
    }
  },

  updateTrialClass: async (
    trialId: string,
    classId: string,
    updates: Partial<TrialClassInput>,
    userId: string
  ): Promise<SyncableTrialClass | null> => {
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
        _lastModifiedBy: userId,
        _syncStatus: 'pending',
      };

      // Persist first, then update state
      await replicatedClassesTable.set(
        classId,
        trialClassToReplicated(updatedClass, trialId),
        true
      );

      set(state => ({
        trialClasses: {
          ...state.trialClasses,
          [trialId]: (state.trialClasses[trialId] || []).map(c =>
            c.id === classId ? updatedClass : c
          ),
        },
      }));

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

      // Persist first, then update state
      await replicatedClassesTable.delete(classId);

      set(state => ({
        trialClasses: {
          ...state.trialClasses,
          [trialId]: (state.trialClasses[trialId] || []).filter(c => c.id !== classId),
        },
      }));
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
  addTrialClassLegacy: (trialId, trialClass) =>
    set(state => {
      const trial = state.trials.find(t => t.id === trialId);
      if (!trial) return state;

      const classes = state.trialClasses[trialId] || [];
      const newId = String(Math.max(0, ...classes.map(c => parseInt(c.id, 10) || 0)) + 1);

      const legacyClass: SyncableTrialClass = {
        ...trialClass,
        id: newId,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'legacy-system',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      return {
        trialClasses: {
          ...state.trialClasses,
          [trialId]: [...classes, legacyClass],
        },
      };
    }),

  updateTrialClassLegacy: (trialId, trialClass) =>
    set(state => {
      const classes = state.trialClasses[trialId] || [];
      return {
        trialClasses: {
          ...state.trialClasses,
          [trialId]: classes.map(c => {
            if (c.id === trialClass.id) {
              return {
                ...trialClass,
                _version: (c._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: 'legacy-system',
                _syncStatus: 'pending' as const,
                _localOnly: false,
              };
            }
            return c;
          }),
        },
      };
    }),

  removeTrialClass: (trialId, classId) =>
    set(state => {
      const classes = state.trialClasses[trialId] || [];
      return {
        trialClasses: {
          ...state.trialClasses,
          [trialId]: classes.filter(c => c.id !== classId),
        },
      };
    }),

  // Subscription Management
  initializeSubscription: () => {
    // Skip if already subscribed or using mock data
    if (get()._unsubscribe || shouldUseMockTrials()) {
      return;
    }

    reportDebug('store', 'Initializing replicated table subscriptions for trials/classes');

    // Subscribe to trial changes
    const unsubTrials = replicatedTrialsTable.subscribe(trials => {
      const currentTrials = get().trials;
      const mergedTrials = trials.map(replicated => {
        const existing = currentTrials.find(t => t.id === replicated.id);
        return mergeTrialData(replicated, existing);
      });
      set({ trials: mergedTrials });
      reportDebug('store', 'Trials updated from replicated table', { count: mergedTrials.length });
    });

    // Subscribe to class changes — group by trialId
    const unsubClasses = replicatedClassesTable.subscribe(classes => {
      const currentClasses = get().trialClasses;
      const grouped: Record<string, SyncableTrialClass[]> = {};

      for (const replicated of classes) {
        const trialId = replicated.trialId || replicated.trial_id;
        if (!trialId) continue;

        const existing = currentClasses[trialId]?.find(c => c.id === replicated.id);
        const merged = mergeTrialClassData(replicated, existing);

        if (!grouped[trialId]) grouped[trialId] = [];
        grouped[trialId].push(merged);
      }

      set({ trialClasses: grouped });
      reportDebug('store', 'Trial classes updated from replicated table', {
        trialCount: Object.keys(grouped).length,
      });
    });

    set({ _unsubscribe: unsubTrials, _unsubscribeClasses: unsubClasses });

    // Load initial data
    get().loadTrials();
    get().loadTrialClasses();
  },

  cleanup: () => {
    const unsubTrials = get()._unsubscribe;
    const unsubClasses = get()._unsubscribeClasses;
    if (unsubTrials) unsubTrials();
    if (unsubClasses) unsubClasses();
    set({ _unsubscribe: null, _unsubscribeClasses: null });
    reportDebug('store', 'Cleaned up replicated table subscriptions for trials/classes');
  },
}));
