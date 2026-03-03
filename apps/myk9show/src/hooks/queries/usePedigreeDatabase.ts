// React Query hooks for pedigree ancestors database operations
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getPedigreeAncestors,
  upsertPedigreeAncestor,
  updatePedigreeAncestor,
  deletePedigreeAncestor,
} from '@/services/database/queries/pedigreeQueries';
import {
  mapDbPedigreeAncestorToApp,
  mapAppPedigreeAncestorToDbInsert,
  mapAppPedigreeAncestorToDbUpdate,
} from '@/services/mappers/pedigreeMappers';
import { cacheStrategies } from '@/lib/queryClient';
import type {
  CreatePedigreeAncestorData,
  UpdatePedigreeAncestorData,
} from '@/types/pedigree-types';

// Query key factory
export const pedigreeQueryKeys = {
  all: ['pedigree-ancestors'] as const,
  dog: (dogId: string) => [...pedigreeQueryKeys.all, 'dog', dogId] as const,
};

function invalidatePedigreeCaches(queryClient: QueryClient, dogId: string) {
  queryClient.invalidateQueries({ queryKey: pedigreeQueryKeys.dog(dogId) });
}

// ========================================
// QUERY HOOKS
// ========================================

export const usePedigreeQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: pedigreeQueryKeys.dog(dogId),
    queryFn: async () => {
      const { data, error } = await getPedigreeAncestors(dogId);
      if (error) throw error;
      return data?.map(mapDbPedigreeAncestorToApp) || [];
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
  });
};

// ========================================
// MUTATION HOOKS
// ========================================

export const useUpsertPedigreeAncestorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: CreatePedigreeAncestorData) => {
      const dbInsert = mapAppPedigreeAncestorToDbInsert(entry);
      const { data, error } = await upsertPedigreeAncestor(dbInsert);
      if (error) throw error;
      return data ? mapDbPedigreeAncestorToApp(data) : null;
    },
    onSuccess: data => {
      if (data) invalidatePedigreeCaches(queryClient, data.dog_id);
    },
  });
};

export const useUpdatePedigreeAncestorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      dogId: string;
      updates: UpdatePedigreeAncestorData;
    }) => {
      const dbUpdate = mapAppPedigreeAncestorToDbUpdate(updates);
      const { data, error } = await updatePedigreeAncestor(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbPedigreeAncestorToApp(data) : null;
    },
    onSuccess: (_data, variables) => {
      invalidatePedigreeCaches(queryClient, variables.dogId);
    },
  });
};

export const useDeletePedigreeAncestorMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dogId }: { id: string; dogId: string }) => {
      const { error } = await deletePedigreeAncestor(id);
      if (error) throw error;
      return { id, dogId };
    },
    onSuccess: result => {
      invalidatePedigreeCaches(queryClient, result.dogId);
    },
  });
};
