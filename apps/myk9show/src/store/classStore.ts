import { create } from 'zustand';
import { replicatedClassesTable, replicatedEntriesTable, type ReplicatedClass, type ReplicatedEntry } from '@/services/replication';
import { getLastModifiedBy } from '@/utils/authHelpers';
import { reportDebug } from '@/utils/standardizedErrorHandler';
import {
  shouldUseMockClasses,
  replicatedToClass,
  mergeClassData,
  mergeEntryData,
  mockClasses,
  mockEntries,
} from './class-store-helpers';
import type {
  ClassInput,
  ClassStoreState,
  EntryInput,
  SyncableClassData,
  SyncableEntryData,
} from './class-store-types';

// Re-export all types for backward compatibility
export type {
  SyncableClassData,
  SyncableEntryData,
  ClassInput,
  EntryInput,
  ClassStoreState,
} from './class-store-types';

// Re-export helpers that may be used externally
export {
  shouldUseMockClasses,
  replicatedToClass,
  mergeClassData,
  replicatedToEntry,
  mergeEntryData,
  mockClasses,
  mockEntries,
} from './class-store-helpers';

export const useClassStore = create<ClassStoreState>()(
  (set, get): ClassStoreState => ({
    // Initial state
    classes: shouldUseMockClasses() ? mockClasses : [],
    entries: shouldUseMockClasses() ? mockEntries : [],
    selectedClassId: shouldUseMockClasses() ? '1' : null,
    isLoading: false,
    error: null,
    _unsubscribeClasses: null,
    _unsubscribeEntries: null,

    // Local-First Class Implementation
    addClass: async (classData: ClassInput): Promise<SyncableClassData> => {
      try {
        set({ isLoading: true, error: null });

        // Create in replicated table
        const id = crypto.randomUUID();
        const replicatedClass: ReplicatedClass = {
          id,
          trialId: classData.trialId,
          name: classData.className || `${classData.element} ${classData.level}`,
          level: classData.level,
          entryFee: classData.entryFee,
          maxEntries: classData.maxEntries,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: getLastModifiedBy(),
          _syncStatus: 'pending',
          _localOnly: true,
        };

        await replicatedClassesTable.set(id, replicatedClass, true);

        // Create full SyncableClassData with local-only fields
        const newClass: SyncableClassData = {
          ...replicatedToClass(replicatedClass),
          ...classData,
          id,
        };

        // Optimistic update - add to store immediately
        set((state) => ({
          classes: [...state.classes, newClass],
          isLoading: false
        }));

        return newClass;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add class';
        set({ error: errorMessage, isLoading: false });
        throw error;
      }
    },

      updateClass: async (id: string, updates: Partial<ClassInput>): Promise<SyncableClassData | null> => {
        try {
          set({ isLoading: true, error: null });

          const currentClass = get().classes.find(c => c.id === id);
          if (!currentClass) {
            const error = `Class with id ${id} not found`;
            set({ error, isLoading: false });
            return null;
          }

          // Update in replicated table
          const currentReplicated = await replicatedClassesTable.get(id);
          if (currentReplicated) {
            await replicatedClassesTable.set(id, {
              ...currentReplicated,
              name: updates.className || currentReplicated.name,
              level: updates.level || currentReplicated.level,
              entryFee: updates.entryFee ?? currentReplicated.entryFee,
              maxEntries: updates.maxEntries ?? currentReplicated.maxEntries,
              _version: (currentReplicated._version || 0) + 1,
              _lastModified: new Date(),
              _syncStatus: 'pending',
            }, true);
          }

          // Create updated class with incremented version
          const updatedClass: SyncableClassData = {
            ...currentClass,
            ...updates,
            _version: currentClass._version ? currentClass._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending'
          };

          // Optimistic update
          set((state) => ({
            classes: state.classes.map(c => c.id === id ? updatedClass : c),
            isLoading: false
          }));

          return updatedClass;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update class';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      deleteClass: async (id: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          const classExists = get().classes.some(c => c.id === id);
          if (!classExists) {
            const error = `Class with id ${id} not found`;
            set({ error, isLoading: false });
            return;
          }

          // Delete from replicated table
          await replicatedClassesTable.delete(id);

          // Optimistic delete - remove class and associated entries immediately
          set((state) => ({
            classes: state.classes.filter(c => c.id !== id),
            entries: state.entries.filter(e => e.classId !== id),
            isLoading: false,
            selectedClassId: state.selectedClassId === id ? null : state.selectedClassId
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete class';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      getClassById: (id: string): SyncableClassData | null => {
        return get().classes.find(c => c.id === id) || null;
      },

      getClassesByTrialId: (trialId: string): SyncableClassData[] => {
        return get().classes.filter(c => c.trialId === trialId);
      },

      // Local-First Entry Implementation
      addEntry: async (entryData: EntryInput): Promise<SyncableEntryData> => {
        try {
          set({ isLoading: true, error: null });

          // Create in replicated table
          const id = crypto.randomUUID();
          const replicatedEntry: ReplicatedEntry = {
            id,
            classId: entryData.classId,
            armband: entryData.armband,
            handler: entryData.handler,
            status: entryData.status,
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending',
            _localOnly: true,
          };

          await replicatedEntriesTable.set(id, replicatedEntry, true);

          // Create full entry with local-only fields
          const newEntry: SyncableEntryData = {
            id,
            ...entryData,
            status: entryData.status as SyncableEntryData['status'],
            score: entryData.score || '',
            time: entryData.time || '',
            placement: entryData.placement || '',
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending',
            _localOnly: true
          };

          // Optimistic update - add to store immediately
          set((state) => ({
            entries: [...state.entries, newEntry],
            isLoading: false
          }));

          return newEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to add entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      updateEntry: async (id: string, updates: Partial<EntryInput>): Promise<SyncableEntryData | null> => {
        try {
          set({ isLoading: true, error: null });

          const currentEntry = get().entries.find(e => e.id === id);
          if (!currentEntry) {
            const error = `Entry with id ${id} not found`;
            set({ error, isLoading: false });
            return null;
          }

          // Update in replicated table
          const currentReplicated = await replicatedEntriesTable.get(id);
          if (currentReplicated) {
            await replicatedEntriesTable.set(id, {
              ...currentReplicated,
              armband: updates.armband ?? currentReplicated.armband,
              handler: updates.handler ?? currentReplicated.handler,
              status: updates.status ?? currentReplicated.status,
              _version: (currentReplicated._version || 0) + 1,
              _lastModified: new Date(),
              _syncStatus: 'pending',
            }, true);
          }

          // Create updated entry with incremented version
          const updatedEntry: SyncableEntryData = {
            ...currentEntry,
            ...updates,
            status: (updates.status || currentEntry.status) as SyncableEntryData['status'],
            _version: currentEntry._version ? currentEntry._version + 1 : 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending'
          };

          // Optimistic update
          set((state) => ({
            entries: state.entries.map(e => e.id === id ? updatedEntry : e),
            isLoading: false
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      deleteEntry: async (id: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          const entryExists = get().entries.some(e => e.id === id);
          if (!entryExists) {
            const error = `Entry with id ${id} not found`;
            set({ error, isLoading: false });
            return;
          }

          // Delete from replicated table
          await replicatedEntriesTable.delete(id);

          // Optimistic delete - remove immediately
          set((state) => ({
            entries: state.entries.filter(e => e.id !== id),
            isLoading: false
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      getEntryById: (id: string): SyncableEntryData | null => {
        return get().entries.find(e => e.id === id) || null;
      },

      getEntriesByClass: (classId: string): SyncableEntryData[] => {
        return get().entries.filter(e => e.classId === classId);
      },

      // Data Management
      setClasses: (classes) => set({ classes }),
      setEntries: (entries) => set({ entries }),

      loadClasses: async (): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          if (shouldUseMockClasses()) {
            set({ classes: mockClasses, entries: mockEntries, isLoading: false });
          } else {
            // Load from replicated tables
            const [replicatedClasses, replicatedEntries] = await Promise.all([
              replicatedClassesTable.getAll(),
              replicatedEntriesTable.getAll()
            ]);

            const currentClasses = get().classes;
            const currentEntries = get().entries;

            const mergedClasses = replicatedClasses.map(replicated => {
              const existing = currentClasses.find(c => c.id === replicated.id);
              return mergeClassData(replicated, existing);
            });

            const mergedEntries = replicatedEntries.map(replicated => {
              const existing = currentEntries.find(e => e.id === replicated.id);
              return mergeEntryData(replicated, existing);
            });

            set({ classes: mergedClasses, entries: mergedEntries, isLoading: false });
            reportDebug('store', 'Loaded from replicated tables', {
              classCount: mergedClasses.length,
              entryCount: mergedEntries.length
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load classes';
          set({ error: errorMessage, isLoading: false });
        }
      },

      // Sync Status
      getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
        const cls = get().classes.find(c => c.id === id);
        if (cls) return cls._syncStatus || 'synced';

        const entry = get().entries.find(e => e.id === id);
        return entry?._syncStatus || 'synced';
      },

      // Selection
      setSelectedClassId: (id) => set({ selectedClassId: id }),

      // Legacy methods for compatibility
      addClassLegacy: (data) => set((state) => ({
        classes: [...state.classes, {
          ...data,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'legacy-system',
          _syncStatus: 'synced' as const,
          _localOnly: false
        } as SyncableClassData]
      })),

      updateClassLegacy: (id, data) =>
        set((state) => ({
          classes: state.classes.map((cls) => {
            if (cls.id === id) {
              return {
                ...cls,
                ...data,
                _version: (cls._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: 'legacy-system',
                _syncStatus: 'pending' as const
              };
            }
            return cls;
          }),
        })),

      deleteClassLegacy: (id) =>
        set((state) => ({
          classes: state.classes.filter((cls) => cls.id !== id),
          entries: state.entries.filter((entry) => entry.classId !== id),
        })),

      addEntryLegacy: (data) => set((state) => ({
        entries: [...state.entries, {
          ...data,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'legacy-system',
          _syncStatus: 'synced' as const,
          _localOnly: false
        } as SyncableEntryData]
      })),

      updateEntryLegacy: (id, data) =>
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id === id) {
              return {
                ...entry,
                ...data,
                _version: (entry._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: 'legacy-system',
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          }),
        })),

  // Template methods
      addClassesFromTemplate: (trialId, generatedClasses) => {
        const newClasses: SyncableClassData[] = generatedClasses.map((genClass, index) => {
          const id = crypto.randomUUID();
          return {
            id,
            trialId,
            trial: `Trial for ${trialId}`,
            trialDate: new Date().toISOString().split('T')[0],
            trialNumber: `TRL-${Date.now()}`,
            classOrder: (index + 1).toString(),
            status: 'Scheduled' as const,
            judge: 'TBD',
            className: genClass.className,
            classNumber: genClass.classNumber,
            element: genClass.element,
            level: genClass.level,
            section: genClass.section,
            entryFee: genClass.entryFee || 25,
            maxEntries: genClass.maxEntries || 40,
            requiresJumpHeight: genClass.requiresJumpHeight || false,
            customFields: genClass.customFields,
            hidesUsed: '',
            distractionsUsed: '',
            itemsUsed: '',
            timeLimit1: '3:00',
            timeLimit2: '',
            timeLimit3: '',
            photoUrl: '',
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'template-system',
            _syncStatus: 'pending' as const,
            _localOnly: true
          };
        });

        set((state) => ({
          classes: [...state.classes, ...newClasses]
        }));

        // Save to replicated table (async, non-blocking)
        newClasses.forEach(async (cls) => {
          try {
            await replicatedClassesTable.set(cls.id, {
              id: cls.id,
              trialId: cls.trialId,
              name: cls.className || `${cls.element} ${cls.level}`,
              level: cls.level,
              entryFee: cls.entryFee,
              maxEntries: cls.maxEntries,
              _version: 1,
              _lastModified: new Date(),
              _syncStatus: 'pending',
              _localOnly: true,
            }, true);
          } catch {
            // Failed to save template class
          }
        });

        return newClasses;
      },

      // Subscription Management
      initializeSubscription: () => {
        if (get()._unsubscribeClasses || shouldUseMockClasses()) {
          return;
        }

        reportDebug('store', 'Initializing replicated table subscriptions for classes/entries');

        // Subscribe to classes
        const unsubClasses = replicatedClassesTable.subscribe((classes) => {
          const currentClasses = get().classes;
          const mergedClasses = classes.map(replicated => {
            const existing = currentClasses.find(c => c.id === replicated.id);
            return mergeClassData(replicated, existing);
          });
          set({ classes: mergedClasses });
        });

        // Subscribe to entries
        const unsubEntries = replicatedEntriesTable.subscribe((entries) => {
          const currentEntries = get().entries;
          const mergedEntries = entries.map(replicated => {
            const existing = currentEntries.find(e => e.id === replicated.id);
            return mergeEntryData(replicated, existing);
          });
          set({ entries: mergedEntries });
        });

        set({ _unsubscribeClasses: unsubClasses, _unsubscribeEntries: unsubEntries });
        get().loadClasses();
      },

      cleanup: () => {
        const unsubClasses = get()._unsubscribeClasses;
        const unsubEntries = get()._unsubscribeEntries;
        if (unsubClasses) unsubClasses();
        if (unsubEntries) unsubEntries();
        set({ _unsubscribeClasses: null, _unsubscribeEntries: null });
        reportDebug('store', 'Cleaned up replicated table subscriptions for classes/entries');
      },
    })
);
