import { create } from 'zustand';
import { replicatedEntriesTable } from '@/services/replication';
import { generateEntryId, mergeEntryData, entryToReplicated } from './entry-store-helpers';
import type {
  EntryStatus,
  EntryStoreState,
  CompetitionData,
  RegistrationData,
  ShowEntry,
  ShowEntryInput,
  SyncableShowEntry,
} from './entry-store-types';

// Re-export all types for backward compatibility
export type {
  EntryStatus,
  StatusHistoryEntry,
  RegistrationData,
  CompetitionData,
  SyncableShowEntry,
  ShowEntryInput,
  ShowEntry,
  EntryStoreState,
} from './entry-store-types';

// Re-export helpers that may be used externally
export { generateEntryId, replicatedToEntry, mergeEntryData, entryToReplicated } from './entry-store-helpers';

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
      createEntry: async (entryData: ShowEntryInput, userId: string): Promise<SyncableShowEntry> => {
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
              userId,
              reason: 'Entry created'
            }],
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastModified: new Date(),
            _lastModifiedBy: userId,
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

      updateEntry: async (entryId: string, updates: Partial<ShowEntryInput>, userId: string): Promise<SyncableShowEntry | null> => {
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
            _lastModifiedBy: userId,
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

      updateRegistration: async (entryId: string, updates: Partial<RegistrationData>, userId: string): Promise<SyncableShowEntry | null> => {
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

      updateResult: async (entryId: string, updates: Partial<CompetitionData>, userId: string): Promise<SyncableShowEntry | null> => {
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
          const errorMessage = error instanceof Error ? error.message : 'Failed to update result';
          set({ error: errorMessage });
          throw error;
        }
      },

      // Bulk operations
      createMultipleEntries: async (entriesData: ShowEntryInput[], userId: string): Promise<SyncableShowEntry[]> => {
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
                userId,
                reason: 'Entry created in batch'
              }],
              createdAt: now,
              updatedAt: now,
              _version: 1,
              _lastModified: new Date(),
              _lastModifiedBy: userId,
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
