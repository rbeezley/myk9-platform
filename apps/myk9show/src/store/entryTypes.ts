import type { ReplicatedEntry } from '@/services/replication';

export type EntryStatus =
  | 'draft'
  | 'submitted'
  | 'paid'
  | 'confirmed'
  | 'scheduled'
  | 'competing'
  | 'completed'
  | 'withdrawn'
  | 'scratched';

export interface StatusHistoryEntry {
  status: EntryStatus;
  timestamp: string;
  userId: string;
  reason?: string | undefined;
}

export interface RegistrationData {
  submittedAt: string;
  handler: string;
  handlerId?: string | undefined;
  entryFee: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  specialRequests?: string | undefined;
  armband?: string | undefined;
  runOrder?: number | undefined;
  jumpHeight?: string | undefined;
  preferredJudge?: string | undefined;
  moveUpRequested?: boolean | undefined;
}

export interface CompetitionData {
  startTime?: string | undefined;
  endTime?: string | undefined;
  score?: string | undefined;
  time?: string | undefined;
  placement?: string | undefined;
  qualified?: boolean | undefined;
  qualification?: string | undefined;
  qualificationReason?: string | undefined;
  faults?: number | undefined;
  judgeNotes?: string | undefined;
  recordedBy: string;
  recordedAt: string;
}

export interface SyncableShowEntry extends ShowEntry {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean | undefined;
}

export interface ShowEntryInput {
  showId: string;
  classId: string;
  dogId: string;
  registrationData: RegistrationData;
  competitionData?: CompetitionData | undefined;
}

export interface ShowEntry {
  id: string;
  showId: string;
  classId: string;
  dogId: string;
  status: EntryStatus;
  registrationData: RegistrationData;
  competitionData?: CompetitionData | undefined;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface EntryStoreState {
  entries: SyncableShowEntry[];
  isLoading: boolean;
  error: string | null;

  _unsubscribe: (() => void) | null;
  initializeSubscription: () => void;
  cleanup: () => void;

  createEntry: (entryData: ShowEntryInput) => Promise<SyncableShowEntry>;
  updateEntry: (entryId: string, updates: Partial<ShowEntryInput>) => Promise<SyncableShowEntry | null>;
  deleteEntry: (entryId: string) => Promise<void>;
  updateRegistration: (entryId: string, updates: Partial<RegistrationData>) => Promise<SyncableShowEntry | null>;
  updateStatus: (entryId: string, status: EntryStatus, userId: string, reason?: string) => Promise<SyncableShowEntry | null>;

  recordResult: (entryId: string, result: CompetitionData) => Promise<SyncableShowEntry | null>;
  updateResult: (entryId: string, updates: Partial<CompetitionData>) => Promise<SyncableShowEntry | null>;

  createMultipleEntries: (entries: ShowEntryInput[]) => Promise<SyncableShowEntry[]>;
  updateEntriesStatus: (entryIds: string[], status: EntryStatus, userId: string, reason?: string) => Promise<void>;

  getEntry: (entryId: string) => SyncableShowEntry | undefined;
  getEntriesByClass: (classId: string) => SyncableShowEntry[];
  getEntriesByShow: (showId: string) => SyncableShowEntry[];
  getEntriesByStatus: (status: EntryStatus) => SyncableShowEntry[];
  getEntriesByDog: (dogId: string) => SyncableShowEntry[];
  getCompetitionResults: (classId: string) => SyncableShowEntry[];
  getRegistrations: (showId: string) => SyncableShowEntry[];

  setEntries: (entries: SyncableShowEntry[]) => void;
  loadEntries: () => Promise<void>;

  getSyncStatus: (id: string) => 'synced' | 'pending' | 'error' | 'conflict';

  createEntryLegacy: (data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>) => string;
  updateRegistrationLegacy: (entryId: string, updates: Partial<RegistrationData>) => void;
  updateStatusLegacy: (entryId: string, status: EntryStatus, userId: string, reason?: string) => void;
  deleteEntryLegacy: (entryId: string) => void;
  recordResultLegacy: (entryId: string, result: CompetitionData) => void;
  updateResultLegacy: (entryId: string, updates: Partial<CompetitionData>) => void;

  getStatsForShow: (showId: string) => {
    totalEntries: number;
    byStatus: Record<EntryStatus, number>;
    totalRevenue: number;
    completionRate: number;
  };

  clearAllEntries: () => void;
  importEntries: (entries: SyncableShowEntry[]) => void;
}

export type EntryStoreSet = (
  partial: EntryStoreState | Partial<EntryStoreState> | ((state: EntryStoreState) => EntryStoreState | Partial<EntryStoreState>),
  replace?: false
) => void;

export type EntryStoreGet = () => EntryStoreState;

export { type ReplicatedEntry };
