import { create } from 'zustand';
import { ClassData, EntryData } from '@/components/classes/types/classTypes';
import { GeneratedClass } from '@/types/class-template-types';
import { replicatedClassesTable, replicatedEntriesTable, type ReplicatedClass, type ReplicatedEntry } from '@/services/replication';
import { getLastModifiedBy } from '@/utils/authHelpers';
import { reportDebug } from '@/utils/standardizedErrorHandler';

// Extend ClassData and EntryData with sync metadata
export interface SyncableClassData extends ClassData {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

export interface SyncableEntryData extends EntryData {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

// Input types for creating/updating classes
export interface ClassInput {
  trialId: string;
  trial: string;
  trialDate: string;
  trialNumber: string;
  classOrder: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled' | 'Upcoming';
  judge: string;
  className?: string;
  classNumber?: string;
  element?: string;
  level?: string;
  section?: string;
  entryFee?: number;
  maxEntries?: number;
  requiresJumpHeight?: boolean;
  customFields?: Record<string, string>;
  // Scent work specific fields
  hidesUsed?: string;
  distractionsUsed?: string;
  itemsUsed?: string;
  timeLimit1?: string;
  timeLimit2?: string;
  timeLimit3?: string;
  photoUrl?: string;
  templateId?: string;
}

export interface EntryInput {
  armband: string;
  handler: string;
  dog: string;
  status: string;
  score?: string;
  time?: string;
  placement?: string;
  classId: string;
}

interface ClassStoreState {
  classes: SyncableClassData[];
  entries: SyncableEntryData[];
  selectedClassId: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Local-First Class Actions
  addClass: (classData: ClassInput) => Promise<SyncableClassData>;
  updateClass: (id: string, updates: Partial<ClassInput>) => Promise<SyncableClassData | null>;
  deleteClass: (id: string) => Promise<void>;
  getClassById: (id: string) => SyncableClassData | null;
  getClassesByTrialId: (trialId: string) => SyncableClassData[];
  
  // Local-First Entry Actions
  addEntry: (entryData: EntryInput) => Promise<SyncableEntryData>;
  updateEntry: (id: string, updates: Partial<EntryInput>) => Promise<SyncableEntryData | null>;
  deleteEntry: (id: string) => Promise<void>;
  getEntryById: (id: string) => SyncableEntryData | null;
  getEntriesByClass: (classId: string) => SyncableEntryData[];
  
  // Data Management
  setClasses: (classes: SyncableClassData[]) => void;
  setEntries: (entries: SyncableEntryData[]) => void;
  loadClasses: () => Promise<void>;
  
  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';
  
  // Selection
  setSelectedClassId: (id: string) => void;
  
  // Template methods
  addClassesFromTemplate: (trialId: string, generatedClasses: GeneratedClass[]) => SyncableClassData[];
  
  // Legacy methods for compatibility
  addClassLegacy: (data: ClassData) => void;
  updateClassLegacy: (id: string, data: Partial<ClassData>) => void;
  deleteClassLegacy: (id: string) => void;
  addEntryLegacy: (data: EntryData) => void;
  updateEntryLegacy: (id: string, data: Partial<EntryData>) => void;
  deleteEntryLegacy: (id: string) => void;

  // Subscription Management (for replicated table sync)
  _unsubscribeClasses: (() => void) | null;
  _unsubscribeEntries: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;
}

// Import global mock data configuration
import { shouldUseMockData } from '@/config/dataSource';

const shouldUseMockClasses = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Classes are part of shows
};

/**
 * Convert ReplicatedClass (database schema) to SyncableClassData (app schema)
 */
function replicatedToClass(replicated: ReplicatedClass): SyncableClassData {
  return {
    id: replicated.id,
    trialId: replicated.trialId || '',
    trial: '', // Local-only: derived
    trialDate: '', // Local-only: derived
    trialNumber: '', // Local-only
    classOrder: '', // Local-only
    status: 'Scheduled',
    judge: '', // Local-only
    className: replicated.name,
    element: '', // Local-only
    level: replicated.level || '',
    section: '', // Local-only
    entryFee: replicated.entryFee || 25,
    maxEntries: replicated.maxEntries || 40,
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated class with existing local data
 */
function mergeClassData(replicated: ReplicatedClass, existing: SyncableClassData | undefined): SyncableClassData {
  const base = replicatedToClass(replicated);
  if (!existing) return base;

  return {
    ...base,
    // Preserve local-only fields
    trial: existing.trial || '',
    trialDate: existing.trialDate || '',
    trialNumber: existing.trialNumber || '',
    classOrder: existing.classOrder || '',
    status: existing.status || 'Scheduled',
    judge: existing.judge || '',
    element: existing.element || '',
    section: existing.section || '',
    hidesUsed: existing.hidesUsed || '',
    distractionsUsed: existing.distractionsUsed || '',
    itemsUsed: existing.itemsUsed || '',
    timeLimit1: existing.timeLimit1 || '',
    timeLimit2: existing.timeLimit2 || '',
    timeLimit3: existing.timeLimit3 || '',
    photoUrl: existing.photoUrl || '',
  };
}

/**
 * Convert ReplicatedEntry (database schema) to SyncableEntryData (app schema)
 */
function replicatedToEntry(replicated: ReplicatedEntry): SyncableEntryData {
  return {
    id: replicated.id,
    armband: replicated.armband || '',
    handler: replicated.handler || '',
    dog: '', // Local-only: need to lookup
    status: (replicated.status || 'Pending') as SyncableEntryData['status'],
    score: '', // Local-only
    time: '', // Local-only
    placement: '', // Local-only
    classId: replicated.classId || '',
    // Sync metadata
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || '',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly || false,
  };
}

/**
 * Merge replicated entry with existing local data
 */
function mergeEntryData(replicated: ReplicatedEntry, existing: SyncableEntryData | undefined): SyncableEntryData {
  const base = replicatedToEntry(replicated);
  if (!existing) return base;

  return {
    ...base,
    dog: existing.dog || '',
    score: existing.score || '',
    time: existing.time || '',
    placement: existing.placement || '',
  };
}

// Mock data with sync metadata
const mockClasses: SyncableClassData[] = [
  {
    id: '1',
    trialId: '1',
    trial: "Scent Work Interior Search",
    trialDate: "2025-07-20",
    trialNumber: "T-2025-001",
    classOrder: "2",
    status: "Scheduled",
    judge: "Sarah Johnson",
    element: "Interior",
    level: "Advanced",
    section: "A",
    hidesUsed: "2",
    distractionsUsed: "2",
    itemsUsed: "Furniture, Cabinets",
    timeLimit1: "3:00",
    timeLimit2: "",
    timeLimit3: "",
    photoUrl: "",
    className: "Interior Advanced",
    entryFee: 30,
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  },
  {
    id: '2',
    trialId: '1',
    trial: "Scent Work Interior Search",
    trialDate: "2025-07-20",
    trialNumber: "T-2025-001",
    classOrder: "1",
    status: "Scheduled",
    judge: "Sarah Johnson",
    element: "Interior",
    level: "Novice",
    section: "A",
    hidesUsed: "1",
    distractionsUsed: "0",
    itemsUsed: "Furniture",
    timeLimit1: "4:00",
    timeLimit2: "",
    timeLimit3: "",
    photoUrl: "",
    className: "Interior Novice",
    entryFee: 25,
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  }
];

const mockEntries: SyncableEntryData[] = [
  {
    id: '1',
    armband: "A101",
    handler: "John Smith",
    dog: "Max",
    status: "Qualified",
    score: "95.5",
    time: "2:15",
    placement: "1st",
    classId: "1",
    // Sync metadata
    _version: 1,
    _lastModified: new Date('2025-01-01T00:00:00Z'),
    _lastModifiedBy: 'system',
    _syncStatus: 'synced',
    _localOnly: false
  }
];

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
        
      deleteEntryLegacy: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
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
