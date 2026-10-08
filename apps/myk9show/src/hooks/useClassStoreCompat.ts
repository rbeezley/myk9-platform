// Compatibility layer between classStore and React Query - Phase 2.5: Class Store Integration
// Provides classStore-compatible API while using database operations

import { useMemo } from 'react';
import type {
  ClassInput,
  EntryInput,
  SyncableClassData,
  SyncableEntryData,
} from '@/store/classStore';
import type { GeneratedClass } from '@/types/class-template-types';
import {
  useClassesQuery,
  useClassQuery,
  useClassesByTrialQuery,
  useCreateClassMutation,
  useUpdateClassMutation,
  useClassStatisticsQuery,
  useEntriesQuery,
  useEntriesByClassQuery,
  useUpdateEntryMutation,
} from '@/hooks/queries/useClassesDatabase';
import { useVerifiedEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import {
  mapClassInputToInsert,
  mapClassInputToUpdate,
  mapDatabaseToClass,
  mapDatabaseClassesArray,
  mapEntryInputToUpdate,
  mapDatabaseToEntry,
  mapDatabaseEntriesArray,
  type DbClassWithRelations,
  type DbEntryWithRelations,
} from '@/services/mappers/classMappers';
import { aggregateQueryErrors, aggregateLoadingStates } from '@/hooks/storeCompatUtils';
import {
  validateClassInput,
  validateClassUpdate,
  addClassesFromTemplateHelper,
} from '@/hooks/classStoreCompatHelpers';

type ClassRowWithoutResultsVerified = Omit<
  DbClassWithRelations,
  'results_verified_at' | 'results_verified_by' | 'results_verified_fingerprint'
>;

/**
 * The mutation select does not carry the MYK9-1045 results_verified_* columns yet, so
 * they map to null. A row that does carry them keeps its values.
 */
const toDbClassWithRelations = (row: ClassRowWithoutResultsVerified): DbClassWithRelations => ({
  results_verified_at: null,
  results_verified_by: null,
  results_verified_fingerprint: null,
  ...row,
});

/**
 * Compatibility hook that provides classStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useClassStoreCompat = (showId?: string) => {
  const classesQuery = useClassesQuery();
  const entriesQuery = useEntriesQuery();
  const entriesByShowQuery = useVerifiedEntriesByShowQuery(showId ?? '', Boolean(showId));
  const currentEntriesQuery = showId ? entriesByShowQuery : entriesQuery;
  const statisticsQuery = useClassStatisticsQuery();

  const createClassMutation = useCreateClassMutation();
  const updateClassMutation = useUpdateClassMutation();

  const updateEntryMutation = useUpdateEntryMutation();

  // Convert database results to classStore format for backward compatibility
  const classes = useMemo(() => {
    if (!classesQuery.data) return [];
    return mapDatabaseClassesArray(classesQuery.data as unknown as DbClassWithRelations[]);
  }, [classesQuery.data]);

  const entries = useMemo(() => {
    if (!currentEntriesQuery.data) return [];
    const rows =
      showId && !Array.isArray(currentEntriesQuery.data)
        ? currentEntriesQuery.data.data
        : currentEntriesQuery.data;
    return mapDatabaseEntriesArray(rows as unknown as DbEntryWithRelations[]);
  }, [currentEntriesQuery.data, showId]);

  // Aggregate loading and error states
  const isLoading = aggregateLoadingStates(
    classesQuery.isLoading,
    currentEntriesQuery.isLoading,
    createClassMutation.isPending,
    updateClassMutation.isPending,
    updateEntryMutation.isPending
  );

  const error = useMemo(
    () =>
      aggregateQueryErrors(
        classesQuery.error,
        currentEntriesQuery.error,
        createClassMutation.error,
        updateClassMutation.error,
        updateEntryMutation.error
      ),
    [
      classesQuery.error,
      currentEntriesQuery.error,
      createClassMutation.error,
      updateClassMutation.error,
      updateEntryMutation.error,
    ]
  );

  // ===== CLASS OPERATIONS =====

  const addClass = async (classData: ClassInput): Promise<SyncableClassData> => {
    validateClassInput(classData);
    const dbData = mapClassInputToInsert(classData);
    const result = await createClassMutation.mutateAsync(dbData);
    return mapDatabaseToClass(toDbClassWithRelations(result));
  };

  const updateClass = async (
    id: string,
    updates: Partial<ClassInput>
  ): Promise<SyncableClassData | null> => {
    validateClassUpdate(id, updates);
    const dbUpdates = mapClassInputToUpdate(updates);
    const result = await updateClassMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToClass(toDbClassWithRelations(result)) : null;
  };

  const getClassById = (id: string): SyncableClassData | null => {
    return classes.find(cls => cls.id === id) || null;
  };

  const getClassesByTrialId = (trialId: string): SyncableClassData[] => {
    return classes.filter(cls => cls.trialId === trialId);
  };

  // ===== ENTRY OPERATIONS =====

  const updateEntry = async (
    id: string,
    updates: Partial<EntryInput>
  ): Promise<SyncableEntryData | null> => {
    const dbUpdates = mapEntryInputToUpdate(updates);
    const result = await updateEntryMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToEntry(result) : null;
  };

  const getEntryById = (id: string): SyncableEntryData | null => {
    return entries.find(entry => entry.id === id) || null;
  };

  const getEntriesByClass = (classId: string): SyncableEntryData[] => {
    return entries.filter(entry => entry.classId === classId);
  };

  // ===== UTILITY FUNCTIONS =====

  const getSyncStatus = (): 'synced' | 'pending' | 'error' | 'conflict' => {
    if (isLoading) return 'pending';
    if (error) return 'error';
    return 'synced';
  };

  const refetch = () => {
    classesQuery.refetch();
    currentEntriesQuery.refetch();
  };

  // Legacy compatibility methods (no-op implementations)
  const setClasses = () => {};
  const setEntries = () => {};
  const loadClasses = async (): Promise<void> => {
    await refetch();
  };
  const setSelectedClassId = () => {};

  // Template method — delegates to helper
  const addClassesFromTemplate = (trialId: string, generatedClasses: GeneratedClass[]) =>
    addClassesFromTemplateHelper(trialId, generatedClasses, addClass);

  // Legacy methods for backward compatibility (deprecated)
  const addClassLegacy = () => {};
  const updateClassLegacy = () => {};
  const deleteClassLegacy = () => {};
  const addEntryLegacy = () => {};
  const updateEntryLegacy = () => {};

  return {
    // Data
    classes,
    entries,
    selectedClassId: null,
    isLoading,
    error,

    // Class Operations (compatible with classStore API)
    addClass,
    updateClass,
    getClassById,
    getClassesByTrialId,

    // Entry Operations (compatible with classStore API)
    updateEntry,
    getEntryById,
    getEntriesByClass,

    // Data Management (deprecated in database mode)
    setClasses,
    setEntries,
    loadClasses,

    // Sync Status
    getSyncStatus,

    // Selection (deprecated - should be component level)
    setSelectedClassId,

    // Template methods
    addClassesFromTemplate,

    // Legacy methods (deprecated)
    addClassLegacy,
    updateClassLegacy,
    deleteClassLegacy,
    addEntryLegacy,
    updateEntryLegacy,

    // Additional React Query benefits
    refetch,
    isStale: classesQuery.isStale || currentEntriesQuery.isStale,
    isFetching: classesQuery.isFetching || currentEntriesQuery.isFetching,
    isEntriesVerified:
      !showId ||
      (!Array.isArray(currentEntriesQuery.data) && currentEntriesQuery.data?.verified === true),

    // Statistics
    statistics: statisticsQuery.data,
    isLoadingStatistics: statisticsQuery.isLoading,

    // Individual mutation states for fine-grained control
    isCreatingClass: createClassMutation.isPending,
    isUpdatingClass: updateClassMutation.isPending,
    isUpdatingEntry: updateEntryMutation.isPending,

    // Legacy compatibility flags
    _usingDatabase: true,
    _reactQueryIntegrated: true,
  };
};

/**
 * Hook for getting a single class with React Query benefits
 */
export const useClassWithQuery = (id: string, enabled = true) => {
  const classQuery = useClassQuery(id, enabled);

  const classData = useMemo(() => {
    if (!classQuery.data) return null;
    return mapDatabaseToClass(classQuery.data as unknown as DbClassWithRelations);
  }, [classQuery.data]);

  return {
    class: classData,
    isLoading: classQuery.isLoading,
    error: classQuery.error?.message || null,
    refetch: classQuery.refetch,
    isStale: classQuery.isStale,
  };
};

/**
 * Hook for getting classes by trial with React Query benefits
 */
export const useTrialClassesWithQuery = (trialId: string, enabled = true) => {
  const trialClassesQuery = useClassesByTrialQuery(trialId, enabled);

  const classes = useMemo(() => {
    if (!trialClassesQuery.data) return [];
    return mapDatabaseClassesArray(trialClassesQuery.data as unknown as DbClassWithRelations[]);
  }, [trialClassesQuery.data]);

  return {
    classes,
    isLoading: trialClassesQuery.isLoading,
    error: trialClassesQuery.error?.message || null,
    refetch: trialClassesQuery.refetch,
    isStale: trialClassesQuery.isStale,
  };
};

/**
 * Hook for getting entries by class with React Query benefits
 */
export const useClassEntriesWithQuery = (classId: string, enabled = true) => {
  const classEntriesQuery = useEntriesByClassQuery(classId, enabled);

  const entries = useMemo(() => {
    if (!classEntriesQuery.data) return [];
    return mapDatabaseEntriesArray(classEntriesQuery.data as unknown as DbEntryWithRelations[]);
  }, [classEntriesQuery.data]);

  return {
    entries,
    isLoading: classEntriesQuery.isLoading,
    error: classEntriesQuery.error?.message || null,
    refetch: classEntriesQuery.refetch,
    isStale: classEntriesQuery.isStale,
  };
};
