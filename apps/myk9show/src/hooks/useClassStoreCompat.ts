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
  useDeleteClassMutation,
  useClassStatisticsQuery,
  useEntriesQuery,
  useEntriesByClassQuery,
  useCreateEntryMutation,
  useUpdateEntryMutation,
  useDeleteEntryMutation,
} from '@/hooks/queries/useClassesDatabase';
import {
  mapClassInputToInsert,
  mapClassInputToUpdate,
  mapDatabaseToClass,
  mapDatabaseClassesArray,
  mapEntryInputToInsert,
  mapEntryInputToUpdate,
  mapDatabaseToEntry,
  mapDatabaseEntriesArray,
  type DbClassWithRelations,
} from '@/services/mappers/classMappers';
import { aggregateQueryErrors, aggregateLoadingStates } from '@/hooks/storeCompatUtils';
import {
  validateClassInput,
  validateClassUpdate,
  validateEntryInput,
  addClassesFromTemplateHelper,
} from '@/hooks/classStoreCompatHelpers';

/**
 * Compatibility hook that provides classStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useClassStoreCompat = () => {
  const classesQuery = useClassesQuery();
  const entriesQuery = useEntriesQuery();
  const statisticsQuery = useClassStatisticsQuery();

  const createClassMutation = useCreateClassMutation();
  const updateClassMutation = useUpdateClassMutation();
  const deleteClassMutation = useDeleteClassMutation();

  const createEntryMutation = useCreateEntryMutation();
  const updateEntryMutation = useUpdateEntryMutation();
  const deleteEntryMutation = useDeleteEntryMutation();

  // Convert database results to classStore format for backward compatibility
  const classes = useMemo(() => {
    if (!classesQuery.data) return [];
    return mapDatabaseClassesArray(classesQuery.data as DbClassWithRelations[]);
  }, [classesQuery.data]);

  const entries = useMemo(() => {
    if (!entriesQuery.data) return [];
    return mapDatabaseEntriesArray(entriesQuery.data);
  }, [entriesQuery.data]);

  // Aggregate loading and error states
  const isLoading = aggregateLoadingStates(
    classesQuery.isLoading,
    entriesQuery.isLoading,
    createClassMutation.isPending,
    updateClassMutation.isPending,
    deleteClassMutation.isPending,
    createEntryMutation.isPending,
    updateEntryMutation.isPending,
    deleteEntryMutation.isPending
  );

  const error = useMemo(
    () =>
      aggregateQueryErrors(
        classesQuery.error,
        entriesQuery.error,
        createClassMutation.error,
        updateClassMutation.error,
        deleteClassMutation.error,
        createEntryMutation.error,
        updateEntryMutation.error,
        deleteEntryMutation.error
      ),
    [
      classesQuery.error,
      entriesQuery.error,
      createClassMutation.error,
      updateClassMutation.error,
      deleteClassMutation.error,
      createEntryMutation.error,
      updateEntryMutation.error,
      deleteEntryMutation.error,
    ]
  );

  // ===== CLASS OPERATIONS =====

  const addClass = async (classData: ClassInput): Promise<SyncableClassData> => {
    validateClassInput(classData);
    const dbData = mapClassInputToInsert(classData);
    const result = await createClassMutation.mutateAsync(dbData);
    return mapDatabaseToClass(result);
  };

  const updateClass = async (
    id: string,
    updates: Partial<ClassInput>
  ): Promise<SyncableClassData | null> => {
    validateClassUpdate(id, updates);
    const dbUpdates = mapClassInputToUpdate(updates);
    const result = await updateClassMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToClass(result) : null;
  };

  const deleteClass = async (id: string): Promise<void> => {
    if (!id) throw new Error('Class ID is required for deletion');
    await deleteClassMutation.mutateAsync({ id });
  };

  const getClassById = (id: string): SyncableClassData | null => {
    return classes.find(cls => cls.id === id) || null;
  };

  const getClassesByTrialId = (trialId: string): SyncableClassData[] => {
    return classes.filter(cls => cls.trialId === trialId);
  };

  // ===== ENTRY OPERATIONS =====

  const addEntry = async (entryData: EntryInput): Promise<SyncableEntryData> => {
    validateEntryInput(entryData);
    const dbData = mapEntryInputToInsert(entryData);
    const result = await createEntryMutation.mutateAsync(dbData);
    return mapDatabaseToEntry(result);
  };

  const updateEntry = async (
    id: string,
    updates: Partial<EntryInput>
  ): Promise<SyncableEntryData | null> => {
    const dbUpdates = mapEntryInputToUpdate(updates);
    const result = await updateEntryMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToEntry(result) : null;
  };

  const deleteEntry = async (id: string): Promise<void> => {
    await deleteEntryMutation.mutateAsync({ id });
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
    entriesQuery.refetch();
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
    deleteClass,
    getClassById,
    getClassesByTrialId,

    // Entry Operations (compatible with classStore API)
    addEntry,
    updateEntry,
    deleteEntry,
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
    isStale: classesQuery.isStale || entriesQuery.isStale,
    isFetching: classesQuery.isFetching || entriesQuery.isFetching,

    // Statistics
    statistics: statisticsQuery.data,
    isLoadingStatistics: statisticsQuery.isLoading,

    // Individual mutation states for fine-grained control
    isCreatingClass: createClassMutation.isPending,
    isUpdatingClass: updateClassMutation.isPending,
    isDeletingClass: deleteClassMutation.isPending,
    isCreatingEntry: createEntryMutation.isPending,
    isUpdatingEntry: updateEntryMutation.isPending,
    isDeletingEntry: deleteEntryMutation.isPending,

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
    return mapDatabaseToClass(classQuery.data as DbClassWithRelations);
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
    return mapDatabaseClassesArray(trialClassesQuery.data as DbClassWithRelations[]);
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
    return mapDatabaseEntriesArray(classEntriesQuery.data);
  }, [classEntriesQuery.data]);

  return {
    entries,
    isLoading: classEntriesQuery.isLoading,
    error: classEntriesQuery.error?.message || null,
    refetch: classEntriesQuery.refetch,
    isStale: classEntriesQuery.isStale,
  };
};
