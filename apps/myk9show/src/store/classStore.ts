import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ClassData, EntryData } from '@/components/classes/types/classTypes';
import { GeneratedClass } from '@/types/class-template-types';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { syncService } from '@/services/sync/syncService';
import { generateId } from '@/utils/idUtils';
import { getLastModifiedBy } from '@/utils/authHelpers';

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
}

// Import global mock data configuration
import { shouldUseMockData } from '@/config/dataSource';

const shouldUseMockClasses = () => {
  return shouldUseMockData('USE_MOCK_SHOWS'); // Classes are part of shows
};

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
  persist(
    (set, get): ClassStoreState => ({
      // Initial state
      classes: shouldUseMockClasses() ? mockClasses : [],
      entries: shouldUseMockClasses() ? mockEntries : [],
      selectedClassId: shouldUseMockClasses() ? '1' : null,
      isLoading: false,
      error: null,
      // Local-First Class Implementation
      addClass: async (classData: ClassInput): Promise<SyncableClassData> => {
        try {
          set({ isLoading: true, error: null });
          
          // Generate optimistic ID and create class with sync metadata
          const optimisticId = generateId();
          const newClass: SyncableClassData = {
            id: optimisticId,
            ...classData,
            
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending',
            _localOnly: false
          };
          
          // Optimistic update - add to store immediately
          set((state) => ({
            classes: [...state.classes, newClass],
            isLoading: false
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'classes',
              entityId: optimisticId,
              operation: 'create',
              data: classData as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue class creation for sync:', syncError);
          }
          
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
          
          // Create updated class with incremented version
          const updatedClass: SyncableClassData = {
            ...currentClass,
            ...updates,
            
            // Update sync metadata
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
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'classes',
              entityId: id,
              operation: 'update',
              data: updates as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue class update for sync:', syncError);
          }
          
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
          
          // Optimistic delete - remove class and associated entries immediately
          set((state) => ({
            classes: state.classes.filter(c => c.id !== id),
            entries: state.entries.filter(e => e.classId !== id),
            isLoading: false,
            // Clear selection if deleted class was selected
            selectedClassId: state.selectedClassId === id ? null : state.selectedClassId
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'classes',
              entityId: id,
              operation: 'delete',
              data: {},
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue class deletion for sync:', syncError);
          }
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
          
          // Generate optimistic ID and create entry with sync metadata
          const optimisticId = generateId();
          const newEntry: SyncableEntryData = {
            id: optimisticId,
            ...entryData,
            status: entryData.status as ('Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn'),
            score: entryData.score || '', // Default to empty string
            time: entryData.time || '', // Default to empty string for time
            placement: entryData.placement || '', // Default to empty string for placement
            
            // Sync metadata for Local-First architecture
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: getLastModifiedBy(),
            _syncStatus: 'pending',
            _localOnly: false
          };
          
          // Optimistic update - add to store immediately
          set((state) => ({
            entries: [...state.entries, newEntry],
            isLoading: false
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'entries',
              entityId: optimisticId,
              operation: 'create',
              data: entryData as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue entry creation for sync:', syncError);
          }
          
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
          
          // Create updated entry with incremented version
          const updatedEntry: SyncableEntryData = {
            ...currentEntry,
            ...updates,
            status: (updates.status || currentEntry.status) as ('Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn'),
            
            // Update sync metadata
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
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'entries',
              entityId: id,
              operation: 'update',
              data: updates as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue entry update for sync:', syncError);
          }
          
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
          
          // Optimistic delete - remove immediately
          set((state) => ({
            entries: state.entries.filter(e => e.id !== id),
            isLoading: false
          }));
          
          // Queue for background sync
          try {
            await syncService.addToQueue({
              entityType: 'entries',
              entityId: id,
              operation: 'delete',
              data: {},
              priority: "medium"
            });
          } catch (syncError) {
            console.warn('Failed to queue entry deletion for sync:', syncError);
          }
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
          // TODO: Implement actual data loading from IndexedDB/API
          set({ isLoading: false });
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
      // Template methods
      addClassesFromTemplate: (trialId, generatedClasses) => {
        const newClasses: SyncableClassData[] = generatedClasses.map((genClass, index) => ({
          id: `class-${Date.now()}-${index}`,
          trialId,
          trial: `Trial for ${trialId}`, // TODO: Get actual trial name
          trialDate: new Date().toISOString().split('T')[0],
          trialNumber: `TRL-${Date.now()}`,
          classOrder: (index + 1).toString(),
          status: 'Scheduled' as const,
          judge: 'TBD',
          // Use generated class data
          className: genClass.className,
          classNumber: genClass.classNumber,
          element: genClass.element,
          level: genClass.level,
          section: genClass.section,
          entryFee: genClass.entryFee || 25,
          maxEntries: genClass.maxEntries || 40,
          requiresJumpHeight: genClass.requiresJumpHeight || false,
          customFields: genClass.customFields,
          // Default scent work fields (can be customized per class later)
          hidesUsed: '',
          distractionsUsed: '',
          itemsUsed: '',
          timeLimit1: '3:00',
          timeLimit2: '',
          timeLimit3: '',
          photoUrl: '',
          // Sync metadata
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'template-system',
          _syncStatus: 'pending' as const,
          _localOnly: false
        }));
        
        set((state) => ({ 
          classes: [...state.classes, ...newClasses] 
        }));
        
        // Queue all template classes for sync
        newClasses.forEach(async (cls) => {
          try {
            await syncService.addToQueue({
              entityType: 'classes',
              entityId: cls.id,
              operation: 'create',
              data: cls as unknown as Record<string, unknown>,
              priority: "medium"
            });
          } catch (syncError) {
            console.warn(`Failed to queue template class ${cls.id} for sync:`, syncError);
          }
        });
        
        return newClasses;
      },
}),
    {
      name: 'myk9show-classes-storage',
      storage: createJSONStorage(() => getOptimalStorage('classes')),
      partialize: (state) => ({
        classes: state.classes,
        entries: state.entries,
        selectedClassId: state.selectedClassId,
      }),
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for classes
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.classes && Array.isArray(state.classes)) {
              // Ensure all classes have proper trial relationships
              state.classes = state.classes.map((cls: unknown) => {
                const c = cls as Record<string, unknown>;
                return {
                  ...c,
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
