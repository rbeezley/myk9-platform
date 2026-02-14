import { ClassData, EntryData } from '@/components/classes/types/classTypes';
import { GeneratedClass } from '@/types/class-template-types';

// Extend ClassData and EntryData with sync metadata
export interface SyncableClassData extends ClassData {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

export interface SyncableEntryData extends EntryData {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
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
  className?: string | undefined;
  classNumber?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  entryFee?: number | undefined;
  maxEntries?: number | undefined;
  requiresJumpHeight?: boolean | undefined;
  customFields?: Record<string, string> | undefined;
  // Scent work specific fields
  hidesUsed?: string | undefined;
  distractionsUsed?: string | undefined;
  itemsUsed?: string | undefined;
  timeLimit1?: string | undefined;
  timeLimit2?: string | undefined;
  timeLimit3?: string | undefined;
  photoUrl?: string | undefined;
  templateId?: string | undefined;
  endTime?: string | undefined;
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

export interface ClassStoreState {
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
