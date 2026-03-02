// React Query hooks for training journal database operations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllTrainingEntries,
  getTrainingEntryById,
  createTrainingEntry,
  updateTrainingEntry,
  deleteTrainingEntry,
  getAllMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from '@/services/database/queries/trainingQueries';
import {
  mapDbTrainingEntryToApp,
  mapAppTrainingEntryToDbInsert,
  mapAppTrainingEntryToDbUpdate,
  mapDbMilestoneToApp,
  mapAppMilestoneToDbInsert,
  mapAppMilestoneToDbUpdate,
  calculateTrainingStatistics,
} from '@/services/mappers/trainingMappers';
import type { TrainingJournalEntry, TrainingMilestone } from '@/types/training';

// Query key factory
export const trainingQueryKeys = {
  all: ['training'] as const,

  // Training entries
  entries: () => [...trainingQueryKeys.all, 'entries'] as const,
  entry: (id: string) => [...trainingQueryKeys.entries(), id] as const,
  dogEntries: (dogId: string) => [...trainingQueryKeys.entries(), 'dog', dogId] as const,

  // Milestones
  milestones: () => [...trainingQueryKeys.all, 'milestones'] as const,
  dogMilestones: (dogId: string) => [...trainingQueryKeys.milestones(), 'dog', dogId] as const,

  // Statistics
  statistics: (dogId: string) => [...trainingQueryKeys.all, 'statistics', dogId] as const,
};

// Cache strategies
const cacheStrategies = {
  moderate: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 10 },
  stable: { staleTime: 1000 * 60 * 15, gcTime: 1000 * 60 * 30 },
};

// ========================================
// TRAINING ENTRY HOOKS
// ========================================

export const useTrainingEntriesQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? trainingQueryKeys.dogEntries(dogId) : trainingQueryKeys.entries(),
    queryFn: async () => {
      const { data, error } = await getAllTrainingEntries(dogId);
      if (error) throw error;
      return data?.map(mapDbTrainingEntryToApp) || [];
    },
    ...cacheStrategies.moderate,
  });
};

export const useTrainingEntryQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: trainingQueryKeys.entry(id),
    queryFn: async () => {
      const { data, error } = await getTrainingEntryById(id);
      if (error) throw error;
      return data ? mapDbTrainingEntryToApp(data) : null;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.moderate,
  });
};

// ========================================
// MILESTONE HOOKS
// ========================================

export const useMilestonesQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? trainingQueryKeys.dogMilestones(dogId) : trainingQueryKeys.milestones(),
    queryFn: async () => {
      const { data, error } = await getAllMilestones(dogId);
      if (error) throw error;
      return data?.map(mapDbMilestoneToApp) || [];
    },
    ...cacheStrategies.stable,
  });
};

// ========================================
// STATISTICS HOOK
// ========================================

export const useTrainingStatisticsQuery = (dogId: string, enabled = true) => {
  const entriesQuery = useTrainingEntriesQuery(dogId);

  return useQuery({
    queryKey: trainingQueryKeys.statistics(dogId),
    queryFn: () => calculateTrainingStatistics(entriesQuery.data || []),
    enabled: !!dogId && enabled && !!entriesQuery.data,
    ...cacheStrategies.moderate,
  });
};

// ========================================
// MUTATION HOOKS
// ========================================

export const useCreateTrainingEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Omit<TrainingJournalEntry, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppTrainingEntryToDbInsert(entry);
      const { data, error } = await createTrainingEntry(dbInsert);
      if (error) throw error;
      return data ? mapDbTrainingEntryToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.entries() });
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.dogEntries(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.statistics(data.dog_id) });
      }
    },
  });
};

export const useUpdateTrainingEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TrainingJournalEntry> }) => {
      const dbUpdate = mapAppTrainingEntryToDbUpdate(updates);
      const { data, error } = await updateTrainingEntry(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbTrainingEntryToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.entry(data.id) });
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.dogEntries(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.statistics(data.dog_id) });
      }
    },
  });
};

export const useDeleteTrainingEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteTrainingEntry(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingQueryKeys.all });
    },
  });
};

// Milestone mutations
export const useCreateMilestoneMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestone: Omit<TrainingMilestone, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppMilestoneToDbInsert(milestone);
      const { data, error } = await createMilestone(dbInsert);
      if (error) throw error;
      return data ? mapDbMilestoneToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.milestones() });
        queryClient.invalidateQueries({ queryKey: trainingQueryKeys.dogMilestones(data.dog_id) });
      }
    },
  });
};

export const useUpdateMilestoneMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TrainingMilestone> }) => {
      const dbUpdate = mapAppMilestoneToDbUpdate(updates);
      const { data, error } = await updateMilestone(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbMilestoneToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({
          queryKey: trainingQueryKeys.dogMilestones(data.dog_id),
        });
      }
    },
  });
};

export const useDeleteMilestoneMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteMilestone(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingQueryKeys.milestones() });
    },
  });
};

// ========================================
// CONVENIENCE HOOK
// ========================================

export const useDogTrainingDataQuery = (dogId: string, enabled = true) => {
  const entries = useTrainingEntriesQuery(dogId);
  const milestones = useMilestonesQuery(dogId);
  const statistics = useTrainingStatisticsQuery(dogId, enabled && !!entries.data);

  return {
    entries,
    milestones,
    statistics,
    isLoading: entries.isLoading || milestones.isLoading,
    isError: entries.isError || milestones.isError,
    error: entries.error || milestones.error,
  };
};
