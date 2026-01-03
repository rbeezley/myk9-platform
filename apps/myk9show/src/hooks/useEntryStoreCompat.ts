// Compatibility layer between entryStore and React Query
// Entry Store Integration - React Query Implementation

import { useMemo } from 'react';
import type { ShowEntry, ShowEntryInput, RegistrationData, CompetitionData, EntryStatus, SyncableShowEntry } from '@/store/entryStore';
import {
  useEntriesQuery,
  useEntryQuery,
  useEntriesByShowQuery,
  useEntriesByClassQuery,
  useEntriesByDogQuery,
  useCreateEntryMutation,
  useUpdateEntryMutation,
  useDeleteEntryMutation,
  useUpdateEntryStatusMutation,
  useCreateMultipleEntriesMutation,
  useEntryStatisticsQuery,
} from '@/hooks/queries/useEntriesDatabase';
import {
  mapEntryInputToInsert,
  mapEntryInputToUpdate,
  mapDatabaseToEntry,
  mapRegistrationDataToUpdate,
  mapCompetitionDataToUpdate,
} from '@/services/mappers/entryMappers';

/**
 * Compatibility hook that provides entryStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useEntryStoreCompat = () => {
  const entriesQuery = useEntriesQuery();
  const createMutation = useCreateEntryMutation();
  const updateMutation = useUpdateEntryMutation();
  const deleteMutation = useDeleteEntryMutation();
  const updateStatusMutation = useUpdateEntryStatusMutation();
  const createMultipleMutation = useCreateMultipleEntriesMutation();
  const statisticsQuery = useEntryStatisticsQuery();

  // Convert database results to SyncableShowEntry format for backward compatibility
  const entries = useMemo(() => {
    if (!entriesQuery.data) return [];
    
    return entriesQuery.data.map((dbEntry): SyncableShowEntry => {
      const entry = mapDatabaseToEntry(dbEntry);
      
      // Add sync metadata for compatibility
      return {
        ...entry,
        _version: 1,
        _lastModified: new Date(entry.updatedAt),
        _lastModifiedBy: 'database',
        _syncStatus: 'synced' as const,
        _localOnly: false,
      };
    });
  }, [entriesQuery.data]);

  // Aggregate loading states
  const isLoading = entriesQuery.isLoading || 
    createMutation.isPending || 
    updateMutation.isPending || 
    deleteMutation.isPending ||
    updateStatusMutation.isPending ||
    createMultipleMutation.isPending;

  // Aggregate error states (prioritize by recency)
  const error = useMemo(() => {
    const errors = [
      entriesQuery.error,
      createMutation.error,
      updateMutation.error,
      deleteMutation.error,
      updateStatusMutation.error,
      createMultipleMutation.error,
    ].filter(Boolean);
    
    if (errors.length === 0) return null;
    return errors[0]?.message || 'An error occurred';
  }, [
    entriesQuery.error, 
    createMutation.error, 
    updateMutation.error, 
    deleteMutation.error,
    updateStatusMutation.error,
    createMultipleMutation.error
  ]);

  // entryStore-compatible API
  const createEntry = async (entryData: ShowEntryInput): Promise<SyncableShowEntry> => {
    const dbData = mapEntryInputToInsert(entryData);
    const result = await createMutation.mutateAsync(dbData);
    const entry = mapDatabaseToEntry(result);
    
    return {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: 'current-user',
      _syncStatus: 'synced',
      _localOnly: false,
    };
  };

  const updateEntry = async (entryId: string, updates: Partial<ShowEntryInput>): Promise<SyncableShowEntry | null> => {
    const dbUpdates = mapEntryInputToUpdate(updates);
    const result = await updateMutation.mutateAsync({ id: entryId, updates: dbUpdates });
    
    if (!result) return null;
    
    const entry = mapDatabaseToEntry(result);
    return {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: 'current-user',
      _syncStatus: 'synced',
      _localOnly: false,
    };
  };

  const deleteEntry = async (entryId: string): Promise<void> => {
    await deleteMutation.mutateAsync(entryId);
  };

  const updateRegistration = async (entryId: string, updates: Partial<RegistrationData>): Promise<SyncableShowEntry | null> => {
    const dbUpdates = mapRegistrationDataToUpdate(updates);
    const result = await updateMutation.mutateAsync({ id: entryId, updates: dbUpdates });
    
    if (!result) return null;
    
    const entry = mapDatabaseToEntry(result);
    return {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: 'current-user',
      _syncStatus: 'synced',
      _localOnly: false,
    };
  };

  const updateStatus = async (entryId: string, status: EntryStatus, userId: string, reason?: string): Promise<SyncableShowEntry | null> => {
    await updateStatusMutation.mutateAsync({ id: entryId, status, userId, reason });
    
    // Return updated entry (simplified - in practice, we'd get it from the mutation result)
    const currentEntry = entries.find(e => e.id === entryId);
    if (!currentEntry) return null;
    
    return {
      ...currentEntry,
      status,
      statusHistory: [
        ...currentEntry.statusHistory,
        {
          status,
          timestamp: new Date().toISOString(),
          userId,
          reason,
        }
      ],
      updatedAt: new Date().toISOString(),
      _version: currentEntry._version + 1,
      _lastModified: new Date(),
      _lastModifiedBy: userId,
      _syncStatus: 'synced',
    };
  };

  const recordResult = async (entryId: string, result: CompetitionData): Promise<SyncableShowEntry | null> => {
    const dbUpdates = mapCompetitionDataToUpdate(result);
    // Also update status to completed
    dbUpdates.status = 'completed';
    
    const dbResult = await updateMutation.mutateAsync({ id: entryId, updates: dbUpdates });
    
    if (!dbResult) return null;
    
    const entry = mapDatabaseToEntry(dbResult);
    return {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: result.recordedBy,
      _syncStatus: 'synced',
      _localOnly: false,
    };
  };

  const updateResult = async (entryId: string, updates: Partial<CompetitionData>): Promise<SyncableShowEntry | null> => {
    const dbUpdates = mapCompetitionDataToUpdate(updates);
    const result = await updateMutation.mutateAsync({ id: entryId, updates: dbUpdates });
    
    if (!result) return null;
    
    const entry = mapDatabaseToEntry(result);
    return {
      ...entry,
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: updates.recordedBy || 'current-user',
      _syncStatus: 'synced',
      _localOnly: false,
    };
  };

  const createMultipleEntries = async (entriesData: ShowEntryInput[]): Promise<SyncableShowEntry[]> => {
    const dbData = entriesData.map(mapEntryInputToInsert);
    const results = await createMultipleMutation.mutateAsync(dbData);
    
    return results.map((result): SyncableShowEntry => {
      const entry = mapDatabaseToEntry(result);
      return {
        ...entry,
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'current-user',
        _syncStatus: 'synced',
        _localOnly: false,
      };
    });
  };

  const updateEntriesStatus = async (entryIds: string[], status: EntryStatus, userId: string, reason?: string): Promise<void> => {
    // Execute status updates in parallel
    await Promise.all(
      entryIds.map(entryId => 
        updateStatusMutation.mutateAsync({ id: entryId, status, userId, reason })
      )
    );
  };

  // Query methods
  const getEntry = (entryId: string): SyncableShowEntry | undefined => {
    return entries.find((entry) => entry.id === entryId);
  };

  const getEntriesByClass = (classId: string): SyncableShowEntry[] => {
    return entries.filter((entry) => entry.classId === classId);
  };

  const getEntriesByShow = (showId: string): SyncableShowEntry[] => {
    return entries.filter((entry) => entry.showId === showId);
  };

  const getEntriesByStatus = (status: EntryStatus): SyncableShowEntry[] => {
    return entries.filter((entry) => entry.status === status);
  };

  const getEntriesByDog = (dogId: string): SyncableShowEntry[] => {
    return entries.filter((entry) => entry.dogId === dogId);
  };

  const getCompetitionResults = (classId: string): SyncableShowEntry[] => {
    return entries.filter(
      (entry) => entry.classId === classId && entry.competitionData
    );
  };

  const getRegistrations = (showId: string): SyncableShowEntry[] => {
    return entries.filter(
      (entry) => entry.showId === showId && ['submitted', 'paid', 'confirmed'].includes(entry.status)
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSyncStatus = (_id: string): 'synced' | 'pending' | 'error' | 'conflict' => {
    if (isLoading) return 'pending';
    if (error) return 'error';
    return 'synced';
  };

  const getStatsForShow = (showId: string) => {
    const showEntries = entries.filter((entry) => entry.showId === showId);
    
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
  };

  const refetch = () => {
    entriesQuery.refetch();
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setEntries = (_newEntries: SyncableShowEntry[]) => {
    // In React Query mode, this would typically not be used
    // as data is managed by the server state
    console.warn('setEntries is not supported in React Query mode');
  };

  const loadEntries = async (): Promise<void> => {
    await entriesQuery.refetch();
  };

  const clearAllEntries = () => {
    console.warn('clearAllEntries is not supported in React Query mode');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const importEntries = (_newEntries: SyncableShowEntry[]) => {
    console.warn('importEntries is not supported in React Query mode');
  };

  // Legacy methods for compatibility
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const createEntryLegacy = (_data: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>): string => {
    console.warn('createEntryLegacy is deprecated, use createEntry instead');
    return 'legacy-not-supported';
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateRegistrationLegacy = (_entryId: string, _updates: Partial<RegistrationData>) => {
    console.warn('updateRegistrationLegacy is deprecated, use updateRegistration instead');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateStatusLegacy = (_entryId: string, _status: EntryStatus, _userId: string, _reason?: string) => {
    console.warn('updateStatusLegacy is deprecated, use updateStatus instead');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deleteEntryLegacy = (_entryId: string) => {
    console.warn('deleteEntryLegacy is deprecated, use deleteEntry instead');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const recordResultLegacy = (_entryId: string, _result: CompetitionData) => {
    console.warn('recordResultLegacy is deprecated, use recordResult instead');
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateResultLegacy = (_entryId: string, _updates: Partial<CompetitionData>) => {
    console.warn('updateResultLegacy is deprecated, use updateResult instead');
  };

  return {
    // Data
    entries,
    isLoading,
    error,
    
    // Operations (compatible with entryStore API)
    createEntry,
    updateEntry,
    deleteEntry,
    updateRegistration,
    updateStatus,
    recordResult,
    updateResult,
    createMultipleEntries,
    updateEntriesStatus,
    
    // Query methods
    getEntry,
    getEntriesByClass,
    getEntriesByShow,
    getEntriesByStatus,
    getEntriesByDog,
    getCompetitionResults,
    getRegistrations,
    getSyncStatus,
    getStatsForShow,
    
    // Data management (with warnings for unsupported operations)
    setEntries,
    loadEntries,
    clearAllEntries,
    importEntries,
    
    // Legacy methods (deprecated)
    createEntryLegacy,
    updateRegistrationLegacy,
    updateStatusLegacy,
    deleteEntryLegacy,
    recordResultLegacy,
    updateResultLegacy,
    
    // Additional React Query benefits
    refetch,
    isStale: entriesQuery.isStale,
    isFetching: entriesQuery.isFetching,
    
    // Statistics
    statistics: statisticsQuery.data,
    isLoadingStatistics: statisticsQuery.isLoading,
    
    // Individual mutation states for fine-grained control
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isUpdatingStatus: updateStatusMutation.isPending,
    isBulkCreating: createMultipleMutation.isPending,
    
    // Legacy compatibility flags
    _usingDatabase: true,
    _reactQueryIntegrated: true,
  };
};

/**
 * Hook for getting a single entry with React Query benefits
 */
export const useEntryWithQuery = (id: string, enabled = true) => {
  const entryQuery = useEntryQuery(id, enabled);
  
  const entry = useMemo(() => {
    if (!entryQuery.data) return null;
    
    const mappedEntry = mapDatabaseToEntry(entryQuery.data);
    return {
      ...mappedEntry,
      _version: 1,
      _lastModified: new Date(mappedEntry.updatedAt),
      _lastModifiedBy: 'database',
      _syncStatus: 'synced' as const,
      _localOnly: false,
    } as SyncableShowEntry;
  }, [entryQuery.data]);

  return {
    entry,
    isLoading: entryQuery.isLoading,
    error: entryQuery.error?.message || null,
    refetch: entryQuery.refetch,
    isStale: entryQuery.isStale,
  };
};

/**
 * Hook for getting entries by show with React Query benefits
 */
export const useShowEntriesWithQuery = (showId: string, enabled = true) => {
  const showEntriesQuery = useEntriesByShowQuery(showId, enabled);
  
  const entries = useMemo(() => {
    if (!showEntriesQuery.data) return [];
    
    return showEntriesQuery.data.map((dbEntry): SyncableShowEntry => {
      const entry = mapDatabaseToEntry(dbEntry);
      return {
        ...entry,
        _version: 1,
        _lastModified: new Date(entry.updatedAt),
        _lastModifiedBy: 'database',
        _syncStatus: 'synced',
        _localOnly: false,
      };
    });
  }, [showEntriesQuery.data]);

  return {
    entries,
    isLoading: showEntriesQuery.isLoading,
    error: showEntriesQuery.error?.message || null,
    refetch: showEntriesQuery.refetch,
    isStale: showEntriesQuery.isStale,
  };
};

/**
 * Hook for getting entries by class with React Query benefits
 */
export const useClassEntriesWithQuery = (classId: string, enabled = true) => {
  const classEntriesQuery = useEntriesByClassQuery(classId, enabled);
  
  const entries = useMemo(() => {
    if (!classEntriesQuery.data) return [];
    
    return classEntriesQuery.data.map((dbEntry): SyncableShowEntry => {
      const entry = mapDatabaseToEntry(dbEntry);
      return {
        ...entry,
        _version: 1,
        _lastModified: new Date(entry.updatedAt),
        _lastModifiedBy: 'database',
        _syncStatus: 'synced',
        _localOnly: false,
      };
    });
  }, [classEntriesQuery.data]);

  return {
    entries,
    isLoading: classEntriesQuery.isLoading,
    error: classEntriesQuery.error?.message || null,
    refetch: classEntriesQuery.refetch,
    isStale: classEntriesQuery.isStale,
  };
};

/**
 * Hook for getting entries by dog with React Query benefits
 */
export const useDogEntriesWithQuery = (dogId: string, enabled = true) => {
  const dogEntriesQuery = useEntriesByDogQuery(dogId, enabled);
  
  const entries = useMemo(() => {
    if (!dogEntriesQuery.data) return [];
    
    return dogEntriesQuery.data.map((dbEntry): SyncableShowEntry => {
      const entry = mapDatabaseToEntry(dbEntry);
      return {
        ...entry,
        _version: 1,
        _lastModified: new Date(entry.updatedAt),
        _lastModifiedBy: 'database',
        _syncStatus: 'synced',
        _localOnly: false,
      };
    });
  }, [dogEntriesQuery.data]);

  return {
    entries,
    isLoading: dogEntriesQuery.isLoading,
    error: dogEntriesQuery.error?.message || null,
    refetch: dogEntriesQuery.refetch,
    isStale: dogEntriesQuery.isStale,
  };
};