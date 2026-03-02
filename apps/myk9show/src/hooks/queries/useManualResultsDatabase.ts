// React Query hooks for manual results database operations
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getAllManualResults,
  getQualifyingManualResults,
  createManualResult,
  updateManualResult,
  deleteManualResult,
} from '@/services/database/queries/manualResultQueries';
import {
  mapDbManualResultToApp,
  mapAppManualResultToDbInsert,
  mapAppManualResultToDbUpdate,
} from '@/services/mappers/manualResultMappers';
import { cacheStrategies } from '@/lib/queryClient';
import type { ManualResult } from '@/types/manual-result-types';

// Query key factory
export const manualResultQueryKeys = {
  all: ['manual-results'] as const,
  dog: (dogId: string) => [...manualResultQueryKeys.all, 'dog', dogId] as const,
  qualifying: (dogId: string) => [...manualResultQueryKeys.all, 'qualifying', dogId] as const,
};

/** Invalidate both dog and qualifying caches for a given dog */
function invalidateManualResultCaches(queryClient: QueryClient, dogId: string) {
  queryClient.invalidateQueries({ queryKey: manualResultQueryKeys.dog(dogId) });
  queryClient.invalidateQueries({ queryKey: manualResultQueryKeys.qualifying(dogId) });
}

// ========================================
// QUERY HOOKS
// ========================================

export const useManualResultsQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: manualResultQueryKeys.dog(dogId),
    queryFn: async () => {
      const { data, error } = await getAllManualResults(dogId);
      if (error) throw error;
      return data?.map(mapDbManualResultToApp) || [];
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
  });
};

export const useQualifyingManualResultsQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: manualResultQueryKeys.qualifying(dogId),
    queryFn: async () => {
      const { data, error } = await getQualifyingManualResults(dogId);
      if (error) throw error;
      return data?.map(mapDbManualResultToApp) || [];
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
  });
};

// ========================================
// MUTATION HOOKS
// ========================================

export const useCreateManualResultMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: Omit<ManualResult, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppManualResultToDbInsert(entry);
      const { data, error } = await createManualResult(dbInsert);
      if (error) throw error;
      return data ? mapDbManualResultToApp(data) : null;
    },
    onSuccess: data => {
      if (data) invalidateManualResultCaches(queryClient, data.dog_id);
    },
  });
};

export const useUpdateManualResultMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ManualResult> }) => {
      const dbUpdate = mapAppManualResultToDbUpdate(updates);
      const { data, error } = await updateManualResult(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbManualResultToApp(data) : null;
    },
    onSuccess: data => {
      if (data) invalidateManualResultCaches(queryClient, data.dog_id);
    },
  });
};

export const useDeleteManualResultMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dogId }: { id: string; dogId: string }) => {
      const { error } = await deleteManualResult(id);
      if (error) throw error;
      return { id, dogId };
    },
    onSuccess: result => {
      invalidateManualResultCaches(queryClient, result.dogId);
    },
  });
};
