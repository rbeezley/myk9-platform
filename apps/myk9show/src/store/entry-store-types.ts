/**
 * Type definitions for the entry store.
 *
 * Contains all interfaces, type aliases, and the store state shape
 * used by `useEntryStore` and its consumers throughout the app.
 */

// Entry lifecycle states
export type EntryStatus =
  | 'draft'           // User building entry
  | 'submitted'       // Entry submitted, awaiting payment
  | 'paid'           // Payment confirmed
  | 'confirmed'      // Entry accepted by show
  | 'scheduled'      // Running order created
  | 'competing'      // Currently in ring
  | 'completed'      // Results recorded
  | 'withdrawn'      // Entry withdrawn
  | 'scratched';     // Scratched day of show

export interface StatusHistoryEntry {
  status: EntryStatus;
  timestamp: string; // ISO string for persistence
  userId: string;
  reason?: string | undefined;
}

export interface RegistrationData {
  submittedAt: string; // ISO string
  handler: string;
  handlerId?: string | undefined;
  entryFee: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  specialRequests?: string | undefined;
  armband?: string | undefined;
  runOrder?: number | undefined;
  // Additional registration fields
  jumpHeight?: string | undefined;
  preferredJudge?: string | undefined;
  moveUpRequested?: boolean | undefined;
}

export interface CompetitionData {
  startTime?: string | undefined; // ISO string
  endTime?: string | undefined; // ISO string
  score?: string | undefined;
  time?: string | undefined;
  placement?: string | undefined;
  qualified?: boolean | undefined;
  qualification?: string | undefined; // The specific qualification status (Qualified, Not Qualified, Absent, Excused, etc.)
  qualificationReason?: string | undefined; // Reason for NQ, Excused, or Withdrawn
  faults?: number | undefined; // Added to support fault tracking
  judgeNotes?: string | undefined;
  recordedBy: string; // Judge/steward who recorded result
  recordedAt: string; // ISO string
}

export interface ShowEntry {
  // Identity
  id: string;
  showId: string;
  classId: string;
  dogId: string;

  // Current state
  status: EntryStatus;

  // Registration phase data
  registrationData: RegistrationData;

  // Competition phase data (only populated when status >= 'competing')
  competitionData?: CompetitionData | undefined;

  // Audit trail
  statusHistory: StatusHistoryEntry[];

  // Metadata
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// Extend ShowEntry with sync metadata
export interface SyncableShowEntry extends ShowEntry {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

// Input types for creating/updating entries
export interface ShowEntryInput {
  showId: string;
  classId: string;
  dogId: string;
  registrationData: RegistrationData;
  competitionData?: CompetitionData | undefined;
}

export interface EntryStoreState {
  entries: SyncableShowEntry[];
  isLoading: boolean;
  error: string | null;

  // Subscription management
  _unsubscribe: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;

  // Local-First Entry Actions
  createEntry: (entryData: ShowEntryInput) => Promise<SyncableShowEntry>;
  updateEntry: (entryId: string, updates: Partial<ShowEntryInput>) => Promise<SyncableShowEntry | null>;
  deleteEntry: (entryId: string) => Promise<void>;
  updateRegistration: (entryId: string, updates: Partial<RegistrationData>) => Promise<SyncableShowEntry | null>;
  updateStatus: (entryId: string, status: EntryStatus, userId: string, reason?: string) => Promise<SyncableShowEntry | null>;

  // Competition phase methods
  recordResult: (entryId: string, result: CompetitionData) => Promise<SyncableShowEntry | null>;
  updateResult: (entryId: string, updates: Partial<CompetitionData>) => Promise<SyncableShowEntry | null>;

  // Bulk operations
  createMultipleEntries: (entries: ShowEntryInput[]) => Promise<SyncableShowEntry[]>;
  updateEntriesStatus: (entryIds: string[], status: EntryStatus, userId: string, reason?: string) => Promise<void>;

  // Query methods
  getEntry: (entryId: string) => SyncableShowEntry | undefined;
  getEntriesByClass: (classId: string) => SyncableShowEntry[];
  getEntriesByShow: (showId: string) => SyncableShowEntry[];
  getEntriesByStatus: (status: EntryStatus) => SyncableShowEntry[];
  getEntriesByDog: (dogId: string) => SyncableShowEntry[];
  getCompetitionResults: (classId: string) => SyncableShowEntry[];
  getRegistrations: (showId: string) => SyncableShowEntry[];

  // Data Management
  setEntries: (entries: SyncableShowEntry[]) => void;
  loadEntries: () => Promise<void>;

  // Sync Status
  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';

  // Legacy methods for compatibility
  createEntryLegacy: (data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>) => string;
  updateRegistrationLegacy: (entryId: string, updates: Partial<RegistrationData>) => void;
  updateStatusLegacy: (entryId: string, status: EntryStatus, userId: string, reason?: string) => void;
  deleteEntryLegacy: (entryId: string) => void;
  recordResultLegacy: (entryId: string, result: CompetitionData) => void;
  updateResultLegacy: (entryId: string, updates: Partial<CompetitionData>) => void;

  // Statistics
  getStatsForShow: (showId: string) => {
    totalEntries: number;
    byStatus: Record<EntryStatus, number>;
    totalRevenue: number;
    completionRate: number;
  };

  // Data management
  clearAllEntries: () => void;
  importEntries: (entries: SyncableShowEntry[]) => void;
}
