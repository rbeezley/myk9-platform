import { create } from 'zustand';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';

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
  reason?: string;
}

export interface RegistrationData {
  submittedAt: string; // ISO string
  handler: string;
  handlerId?: string;
  entryFee: number;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  specialRequests?: string;
  armband?: string;
  runOrder?: number;
  // Additional registration fields
  jumpHeight?: string;
  preferredJudge?: string;
  moveUpRequested?: boolean;
}

export interface CompetitionData {
  startTime?: string; // ISO string
  endTime?: string; // ISO string
  score?: string;
  time?: string;
  placement?: string;
  qualified?: boolean;
  qualification?: string; // The specific qualification status (Qualified, Not Qualified, Absent, Excused, etc.)
  qualificationReason?: string; // Reason for NQ, Excused, or Withdrawn
  faults?: number; // Added to support fault tracking
  judgeNotes?: string;
  recordedBy: string; // Judge/steward who recorded result
  recordedAt: string; // ISO string
}

// Extend ShowEntry with sync metadata
export interface SyncableShowEntry extends ShowEntry {
  _version: number;
  _lastModified: Date;
  _lastModifiedBy: string;
  _syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  _localOnly?: boolean;
}

// Input types for creating/updating entries
export interface ShowEntryInput {
  showId: string;
  classId: string;
  dogId: string;
  registrationData: RegistrationData;
  competitionData?: CompetitionData;
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
  competitionData?: CompetitionData;
  
  // Audit trail
  statusHistory: StatusHistoryEntry[];
  
  // Metadata
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
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

const generateEntryId = () => `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Convert ReplicatedEntry from replicated table to SyncableShowEntry for store
 */
function replicatedToEntry(replicated: ReplicatedEntry): SyncableShowEntry {
  return {
    id: replicated.id,
    showId: replicated.showId || '',
    classId: replicated.classId || '',
    dogId: replicated.dogId || '',
    status: (replicated.entryStatus as EntryStatus) || 'draft',
    registrationData: {
      submittedAt: replicated.submittedAt || new Date().toISOString(),
      handler: replicated.handler || '',
      handlerId: replicated.handlerId,
      entryFee: replicated.entryFee || 0,
      paymentStatus: (replicated.paymentStatus as 'pending' | 'paid' | 'refunded') || 'pending',
      specialRequests: replicated.specialRequests,
      armband: replicated.armband,
      runOrder: replicated.runOrder,
      jumpHeight: replicated.jumpHeight,
      preferredJudge: replicated.preferredJudge,
      moveUpRequested: replicated.moveUpRequested,
    },
    statusHistory: [],
    createdAt: replicated.submittedAt || new Date().toISOString(),
    updatedAt: replicated._lastModified?.toISOString() || new Date().toISOString(),
    _version: replicated._version || 1,
    _lastModified: replicated._lastModified || new Date(),
    _lastModifiedBy: replicated._lastModifiedBy || 'system',
    _syncStatus: replicated._syncStatus || 'synced',
    _localOnly: replicated._localOnly,
  };
}

/**
 * Merge ReplicatedEntry with existing SyncableShowEntry, preserving local-only fields
 */
function mergeEntryData(replicated: ReplicatedEntry, existing: SyncableShowEntry | undefined): SyncableShowEntry {
  const base = replicatedToEntry(replicated);
  if (!existing) return base;

  // Preserve local-only fields that aren't in the replicated table
  return {
    ...base,
    statusHistory: existing.statusHistory || base.statusHistory,
    competitionData: existing.competitionData,
  };
}

/**
 * Convert SyncableShowEntry to ReplicatedEntry for storage
 */
function entryToReplicated(entry: SyncableShowEntry): ReplicatedEntry {
  return {
    id: entry.id,
    showId: entry.showId,
    classId: entry.classId,
    dogId: entry.dogId,
    handlerId: entry.registrationData.handlerId,
    armband: entry.registrationData.armband,
    handler: entry.registrationData.handler,
    status: entry.status,
    entryStatus: entry.status,
    jumpHeight: entry.registrationData.jumpHeight,
    entryFee: entry.registrationData.entryFee,
    paymentStatus: entry.registrationData.paymentStatus,
    runOrder: entry.registrationData.runOrder,
    moveUpRequested: entry.registrationData.moveUpRequested,
    preferredJudge: entry.registrationData.preferredJudge,
    specialRequests: entry.registrationData.specialRequests,
    submittedAt: entry.registrationData.submittedAt,
    _version: entry._version,
    _lastModified: entry._lastModified,
    _lastModifiedBy: entry._lastModifiedBy,
    _syncStatus: entry._syncStatus,
    _localOnly: entry._localOnly,
  };
}

export const useEntryStore = create<EntryStoreState>()(
    (set, get): EntryStoreState => ({
      // Subscription management
      _unsubscribe: null as (() => void) | null,
      entries: [],
      isLoading: false,
      error: null,
      
      // Subscription management methods
      initializeSubscription: () => {
        const unsubscribe = replicatedEntriesTable.subscribe((entries) => {
          const currentEntries = get().entries;
          const entriesMap = new Map(currentEntries.map(e => [e.id, e]));

          const mergedEntries = entries.map(replicated =>
            mergeEntryData(replicated, entriesMap.get(replicated.id))
          );

          set({ entries: mergedEntries });
        });

        set({ _unsubscribe: unsubscribe });
        get().loadEntries();
      },

      cleanup: () => {
        const unsubscribe = get()._unsubscribe;
        if (unsubscribe) {
          unsubscribe();
          set({ _unsubscribe: null });
        }
      },

      // Local-First Entry Implementation
      createEntry: async (entryData: ShowEntryInput): Promise<SyncableShowEntry> => {
        try {
          set({ isLoading: true, error: null });

          const id = crypto.randomUUID();
          const now = new Date().toISOString();

          const newEntry: SyncableShowEntry = {
            ...entryData,
            id,
            status: 'draft',
            statusHistory: [{
              status: 'draft',
              timestamp: now,
              userId: 'current-user',
              reason: 'Entry created'
            }],
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending',
            _localOnly: true
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(newEntry);
          await replicatedEntriesTable.set(id, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: [...state.entries, newEntry],
            isLoading: false
          }));

          return newEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      updateEntry: async (entryId: string, updates: Partial<ShowEntryInput>): Promise<SyncableShowEntry | null> => {
        try {
          set({ isLoading: true, error: null });

          const currentEntry = get().entries.find(e => e.id === entryId);
          if (!currentEntry) {
            const error = `Entry with id ${entryId} not found`;
            set({ error, isLoading: false });
            return null;
          }

          const updatedEntry: SyncableShowEntry = {
            ...currentEntry,
            ...updates,
            updatedAt: new Date().toISOString(),
            _version: (currentEntry._version || 0) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending'
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(updatedEntry);
          await replicatedEntriesTable.set(entryId, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: state.entries.map(e => e.id === entryId ? updatedEntry : e),
            isLoading: false
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      deleteEntry: async (entryId: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          const entryExists = get().entries.some(e => e.id === entryId);
          if (!entryExists) {
            const error = `Entry with id ${entryId} not found`;
            set({ error, isLoading: false });
            return;
          }

          // Delete from replicated table
          await replicatedEntriesTable.delete(entryId);

          // Update local state
          set((state) => ({
            entries: state.entries.filter(e => e.id !== entryId),
            isLoading: false
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete entry';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      updateRegistration: async (entryId: string, updates: Partial<RegistrationData>): Promise<SyncableShowEntry | null> => {
        try {
          const currentEntry = get().entries.find(e => e.id === entryId);
          if (!currentEntry) {
            set({ error: `Entry with id ${entryId} not found` });
            return null;
          }

          const now = new Date().toISOString();
          const updatedEntry: SyncableShowEntry = {
            ...currentEntry,
            registrationData: { ...currentEntry.registrationData, ...updates },
            updatedAt: now,
            _version: (currentEntry._version || 0) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: 'current-user',
            _syncStatus: 'pending'
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(updatedEntry);
          await replicatedEntriesTable.set(entryId, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: state.entries.map(e => e.id === entryId ? updatedEntry : e)
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update registration';
          set({ error: errorMessage });
          throw error;
        }
      },
      
      updateStatus: async (entryId: string, status: EntryStatus, userId: string, reason?: string): Promise<SyncableShowEntry | null> => {
        try {
          const currentEntry = get().entries.find(e => e.id === entryId);
          if (!currentEntry) {
            set({ error: `Entry with id ${entryId} not found` });
            return null;
          }

          const now = new Date().toISOString();
          const updatedEntry: SyncableShowEntry = {
            ...currentEntry,
            status,
            statusHistory: [
              ...currentEntry.statusHistory,
              { status, timestamp: now, userId, reason }
            ],
            updatedAt: now,
            _version: (currentEntry._version || 0) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: userId,
            _syncStatus: 'pending'
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(updatedEntry);
          await replicatedEntriesTable.set(entryId, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: state.entries.map(e => e.id === entryId ? updatedEntry : e)
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update status';
          set({ error: errorMessage });
          throw error;
        }
      },

      // Competition phase methods
      recordResult: async (entryId: string, result: CompetitionData): Promise<SyncableShowEntry | null> => {
        try {
          const currentEntry = get().entries.find(e => e.id === entryId);
          if (!currentEntry) {
            set({ error: `Entry with id ${entryId} not found` });
            return null;
          }

          const now = new Date().toISOString();
          const updatedEntry: SyncableShowEntry = {
            ...currentEntry,
            status: 'completed',
            competitionData: { ...result, recordedAt: now },
            statusHistory: [
              ...currentEntry.statusHistory,
              { status: 'completed', timestamp: now, userId: result.recordedBy, reason: 'Results recorded' }
            ],
            updatedAt: now,
            _version: (currentEntry._version || 0) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: result.recordedBy,
            _syncStatus: 'pending'
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(updatedEntry);
          await replicatedEntriesTable.set(entryId, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: state.entries.map(e => e.id === entryId ? updatedEntry : e)
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to record result';
          set({ error: errorMessage });
          throw error;
        }
      },

      updateResult: async (entryId: string, updates: Partial<CompetitionData>): Promise<SyncableShowEntry | null> => {
        try {
          const currentEntry = get().entries.find(e => e.id === entryId);
          if (!currentEntry) {
            set({ error: `Entry with id ${entryId} not found` });
            return null;
          }

          const now = new Date().toISOString();
          const updatedEntry: SyncableShowEntry = {
            ...currentEntry,
            competitionData: currentEntry.competitionData
              ? { ...currentEntry.competitionData, ...updates }
              : { ...updates, recordedAt: now, recordedBy: updates.recordedBy || 'Secretary' },
            updatedAt: now,
            _version: (currentEntry._version || 0) + 1,
            _lastModified: new Date(),
            _lastModifiedBy: updates.recordedBy || 'current-user',
            _syncStatus: 'pending'
          };

          // Save to replicated table
          const replicatedEntry = entryToReplicated(updatedEntry);
          await replicatedEntriesTable.set(entryId, replicatedEntry, true);

          // Update local state
          set((state) => ({
            entries: state.entries.map(e => e.id === entryId ? updatedEntry : e)
          }));

          return updatedEntry;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update result';
          set({ error: errorMessage });
          throw error;
        }
      },
      
      // Bulk operations
      createMultipleEntries: async (entriesData: ShowEntryInput[]): Promise<SyncableShowEntry[]> => {
        try {
          set({ isLoading: true, error: null });

          const now = new Date().toISOString();
          const newEntries: SyncableShowEntry[] = entriesData.map((data) => {
            const id = crypto.randomUUID();

            return {
              ...data,
              id,
              status: 'draft' as EntryStatus,
              statusHistory: [{
                status: 'draft' as EntryStatus,
                timestamp: now,
                userId: 'current-user',
                reason: 'Entry created in batch'
              }],
              createdAt: now,
              updatedAt: now,
              _version: 1,
              _lastModified: new Date(),
              _lastModifiedBy: 'current-user',
              _syncStatus: 'pending' as const,
              _localOnly: true
            };
          });

          // Save all to replicated table
          for (const entry of newEntries) {
            const replicatedEntry = entryToReplicated(entry);
            await replicatedEntriesTable.set(entry.id, replicatedEntry, true);
          }

          // Update local state
          set((state) => ({
            entries: [...state.entries, ...newEntries],
            isLoading: false
          }));

          return newEntries;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create multiple entries';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      updateEntriesStatus: async (entryIds: string[], status: EntryStatus, userId: string, reason?: string): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          const now = new Date().toISOString();
          const statusUpdate = { status, timestamp: now, userId, reason };
          const currentEntries = get().entries;

          // Build updated entries
          const updatedEntries = currentEntries.map((entry) => {
            if (entryIds.includes(entry.id)) {
              return {
                ...entry,
                status,
                statusHistory: [...entry.statusHistory, statusUpdate],
                updatedAt: now,
                _version: (entry._version || 0) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: userId,
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          });

          // Save to replicated table
          for (const entry of updatedEntries) {
            if (entryIds.includes(entry.id)) {
              const replicatedEntry = entryToReplicated(entry);
              await replicatedEntriesTable.set(entry.id, replicatedEntry, true);
            }
          }

          // Update local state
          set({ entries: updatedEntries, isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update entries status';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      // Query methods
      getEntry: (entryId) => {
        return get().entries.find((entry) => entry.id === entryId);
      },
      
      getEntriesByClass: (classId) => {
        return get().entries.filter((entry) => entry.classId === classId);
      },
      
      getEntriesByShow: (showId) => {
        return get().entries.filter((entry) => entry.showId === showId);
      },
      
      getEntriesByStatus: (status) => {
        return get().entries.filter((entry) => entry.status === status);
      },
      
      getEntriesByDog: (dogId) => {
        return get().entries.filter((entry) => entry.dogId === dogId);
      },
      
      getCompetitionResults: (classId) => {
        return get().entries.filter(
          (entry) => entry.classId === classId && entry.competitionData
        );
      },
      
      getRegistrations: (showId) => {
        return get().entries.filter(
          (entry) => entry.showId === showId && ['submitted', 'paid', 'confirmed'].includes(entry.status)
        );
      },
      
      // Data Management
      setEntries: (entries) => set({ entries }),
      
      loadEntries: async (): Promise<void> => {
        try {
          set({ isLoading: true, error: null });

          // Load from replicated table
          const replicatedEntries = await replicatedEntriesTable.getAll();
          const currentEntries = get().entries;
          const entriesMap = new Map(currentEntries.map(e => [e.id, e]));

          // Merge replicated data with existing local-only fields
          const mergedEntries = replicatedEntries.map(replicated =>
            mergeEntryData(replicated, entriesMap.get(replicated.id))
          );

          set({ entries: mergedEntries, isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load entries';
          set({ error: errorMessage, isLoading: false });
        }
      },
      
      // Sync Status
      getSyncStatus: (id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
        const entry = get().entries.find(e => e.id === id);
        return entry?._syncStatus || 'synced';
      },
      
      // Statistics
      getStatsForShow: (showId) => {
        const showEntries = get().entries.filter((entry) => entry.showId === showId);
        
        const byStatus = showEntries.reduce((acc, entry) => {
          acc[entry.status] = (acc[entry.status] || 0) + 1;
          return acc;
        }, {} as Record<EntryStatus, number>);
        
        const totalRevenue = showEntries
          .filter((entry) => entry.registrationData.paymentStatus === 'paid')
          .reduce((sum, entry) => sum + entry.registrationData.entryFee, 0);
        
        const completedEntries = showEntries.filter((entry) => entry.status === 'completed').length;
        const totalPaidEntries = showEntries.filter((entry) => entry.registrationData.paymentStatus === 'paid').length;
        const completionRate = totalPaidEntries > 0 ? (completedEntries / totalPaidEntries) * 100 : 0;
        
        return {
          totalEntries: showEntries.length,
          byStatus,
          totalRevenue,
          completionRate
        };
      },
      
      // Legacy methods for compatibility
      createEntryLegacy: (data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>) => {
        const id = generateEntryId();
        const now = new Date().toISOString();
        
        const newEntry: SyncableShowEntry = {
          ...data,
          id,
          status: 'draft',
          statusHistory: [{
            status: 'draft',
            timestamp: now,
            userId: 'legacy-system',
            reason: 'Entry created'
          }],
          createdAt: now,
          updatedAt: now,
          // Sync metadata
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'legacy-system',
          _syncStatus: 'synced',
          _localOnly: false
        };
        
        set((state) => ({
          entries: [...state.entries, newEntry]
        }));
        
        return id;
      },
      
      updateRegistrationLegacy: (entryId, updates) => {
        const now = new Date().toISOString();
        
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id === entryId) {
              return {
                ...entry,
                registrationData: { ...entry.registrationData, ...updates },
                updatedAt: now,
                _version: (entry._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: 'legacy-system',
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          })
        }));
      },
      
      updateStatusLegacy: (entryId, status, userId, reason) => {
        const now = new Date().toISOString();
        
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id === entryId) {
              return {
                ...entry,
                status,
                statusHistory: [
                  ...entry.statusHistory,
                  {
                    status,
                    timestamp: now,
                    userId,
                    reason
                  }
                ],
                updatedAt: now,
                _version: (entry._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: userId,
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          })
        }));
      },
      
      deleteEntryLegacy: (entryId) => {
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== entryId)
        }));
      },
      
      recordResultLegacy: (entryId, result) => {
        const now = new Date().toISOString();
        
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id === entryId) {
              return {
                ...entry,
                status: 'completed' as const,
                competitionData: {
                  ...result,
                  recordedAt: now
                },
                statusHistory: [
                  ...entry.statusHistory,
                  {
                    status: 'completed' as const,
                    timestamp: now,
                    userId: result.recordedBy,
                    reason: 'Results recorded'
                  }
                ],
                updatedAt: now,
                _version: (entry._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: result.recordedBy,
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          })
        }));
      },
      
      updateResultLegacy: (entryId, updates) => {
        const now = new Date().toISOString();
        
        set((state) => ({
          entries: state.entries.map((entry) => {
            if (entry.id === entryId) {
              return {
                ...entry,
                competitionData: entry.competitionData 
                  ? { ...entry.competitionData, ...updates }
                  : { ...updates, recordedAt: now, recordedBy: updates.recordedBy || 'Secretary' },
                updatedAt: now,
                _version: (entry._version || 1) + 1,
                _lastModified: new Date(),
                _lastModifiedBy: updates.recordedBy || 'legacy-system',
                _syncStatus: 'pending' as const
              };
            }
            return entry;
          })
        }));
      },
      
      // Data management
      clearAllEntries: () => {
        set({ entries: [] });
      },
      
      importEntries: (entries) => {
        set({ entries });
      }
    })
);

// NOTE: Convenience selector hooks have been removed due to infinite re-render issues
// Use the custom hooks from /src/hooks/useFilteredEntries.ts instead for safe filtering