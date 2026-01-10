import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface EntityService<T> {
  create: (data: Partial<T>) => Promise<T>;
  update: (id: string, updates: Partial<T>) => Promise<T>;
  delete: (id: string) => Promise<void>;
  bulkUpdate?: (ids: string[], updates: Partial<T>) => Promise<T[]>;
  bulkDelete?: (ids: string[]) => Promise<void>;
}

interface MutationOptions<T> {
  entityName: string;
  service: EntityService<T>;
  queryKeys: {
    all: readonly string[];
    single: (id: string) => readonly string[];
    related?: (entityId: string) => readonly string[][];
  };
  onSuccessMessage?: {
    create?: string;
    update?: string;
    delete?: string;
    bulkUpdate?: string;
    bulkDelete?: string;
  };
  onErrorMessage?: {
    create?: string;
    update?: string;
    delete?: string;
    bulkUpdate?: string;
    bulkDelete?: string;
  };
}

export function useCreateEntity<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  return useMutation({
    mutationFn: service.create,
    onSuccess: (newEntity) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: queryKeys.all });
      
      // Optimistically update cache
      queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
        if (!oldData) return [newEntity];
        return [...oldData, newEntity];
      });

      // Invalidate related queries if provided
      if (queryKeys.related) {
        queryKeys.related(newEntity.id).forEach(relatedKey => {
          queryClient.invalidateQueries({ queryKey: relatedKey });
        });
      }

      // Show success message
      toast.success(onSuccessMessage?.create || `${entityName} created successfully`);
    },
    onError: () => {
      toast.error(onErrorMessage?.create || `Failed to create ${entityName}`);
    },
  });
}

export function useUpdateEntity<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<T> }) =>
      service.update(id, updates),
    onSuccess: (updatedEntity) => {
      // Update single entity cache
      queryClient.setQueryData(queryKeys.single(updatedEntity.id), updatedEntity);
      
      // Update list cache
      queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
        if (!oldData) return [updatedEntity];
        return oldData.map(entity => entity.id === updatedEntity.id ? updatedEntity : entity);
      });

      // Invalidate related queries if provided
      if (queryKeys.related) {
        queryKeys.related(updatedEntity.id).forEach(relatedKey => {
          queryClient.invalidateQueries({ queryKey: relatedKey });
        });
      }

      // Show success message
      toast.success(onSuccessMessage?.update || `${entityName} updated successfully`);
    },
    onError: () => {
      toast.error(onErrorMessage?.update || `Failed to update ${entityName}`);
    },
  });
}

export function useDeleteEntity<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  return useMutation({
    mutationFn: service.delete,
    onSuccess: (_, deletedId) => {
      // Remove from single entity cache
      queryClient.removeQueries({ queryKey: queryKeys.single(deletedId) });
      
      // Remove from list cache
      queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(entity => entity.id !== deletedId);
      });

      // Invalidate related queries if provided
      if (queryKeys.related) {
        queryKeys.related(deletedId).forEach(relatedKey => {
          queryClient.invalidateQueries({ queryKey: relatedKey });
        });
      }

      // Show success message
      toast.success(onSuccessMessage?.delete || `${entityName} deleted successfully`);
    },
    onError: () => {
      toast.error(onErrorMessage?.delete || `Failed to delete ${entityName}`);
    },
  });
}

export function useBulkUpdateEntities<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  if (!service.bulkUpdate) {
    throw new Error(`Bulk update not supported for ${entityName}`);
  }

  return useMutation({
    mutationFn: ({ ids, updates }: { ids: string[]; updates: Partial<T> }) =>
      service.bulkUpdate!(ids, updates),
    onSuccess: (updatedEntities) => {
      // Update individual entity caches
      updatedEntities.forEach(entity => {
        queryClient.setQueryData(queryKeys.single(entity.id), entity);
      });
      
      // Update list cache
      queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
        if (!oldData) return updatedEntities;
        const updatedMap = new Map(updatedEntities.map(entity => [entity.id, entity]));
        return oldData.map(entity => updatedMap.get(entity.id) || entity);
      });

      // Invalidate related queries if provided
      if (queryKeys.related) {
        updatedEntities.forEach(entity => {
          queryKeys.related!(entity.id).forEach(relatedKey => {
            queryClient.invalidateQueries({ queryKey: relatedKey });
          });
        });
      }

      // Show success message
      toast.success(onSuccessMessage?.bulkUpdate || `${updatedEntities.length} ${entityName}s updated successfully`);
    },
    onError: () => {
      toast.error(onErrorMessage?.bulkUpdate || `Failed to update ${entityName}s`);
    },
  });
}

export function useBulkDeleteEntities<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  if (!service.bulkDelete) {
    throw new Error(`Bulk delete not supported for ${entityName}`);
  }

  return useMutation({
    mutationFn: service.bulkDelete,
    onSuccess: (_, deletedIds) => {
      // Remove from individual entity caches
      deletedIds.forEach(id => {
        queryClient.removeQueries({ queryKey: queryKeys.single(id) });
      });
      
      // Remove from list cache
      queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
        if (!oldData) return [];
        const deletedSet = new Set(deletedIds);
        return oldData.filter(entity => !deletedSet.has(entity.id));
      });

      // Invalidate related queries if provided
      if (queryKeys.related) {
        deletedIds.forEach(id => {
          queryKeys.related!(id).forEach(relatedKey => {
            queryClient.invalidateQueries({ queryKey: relatedKey });
          });
        });
      }

      // Show success message
      toast.success(onSuccessMessage?.bulkDelete || `${deletedIds.length} ${entityName}s deleted successfully`);
    },
    onError: () => {
      toast.error(onErrorMessage?.bulkDelete || `Failed to delete ${entityName}s`);
    },
  });
}

// Optimistic mutation helpers
export function useOptimisticUpdateEntity<T extends { id: string }>(options: MutationOptions<T>) {
  const queryClient = useQueryClient();
  const { entityName, service, queryKeys, onSuccessMessage, onErrorMessage } = options;

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<T> }) =>
      service.update(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.single(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.all });

      // Snapshot previous values
      const previousEntity = queryClient.getQueryData(queryKeys.single(id));
      const previousEntities = queryClient.getQueryData(queryKeys.all);

      // Optimistically update
      if (previousEntity) {
        const optimisticEntity = { ...previousEntity as T, ...updates };
        queryClient.setQueryData(queryKeys.single(id), optimisticEntity);
        
        queryClient.setQueryData(queryKeys.all, (oldData: T[] | undefined) => {
          if (!oldData) return [optimisticEntity];
          return oldData.map(entity => entity.id === id ? optimisticEntity : entity);
        });
      }

      return { previousEntity, previousEntities };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousEntity) {
        queryClient.setQueryData(queryKeys.single(variables.id), context.previousEntity);
      }
      if (context?.previousEntities) {
        queryClient.setQueryData(queryKeys.all, context.previousEntities);
      }

      void err; // Error available for future logging
      toast.error(onErrorMessage?.update || `Failed to update ${entityName}`);
    },
    onSuccess: () => {
      toast.success(onSuccessMessage?.update || `${entityName} updated successfully`);
    },
    onSettled: (data, error, variables) => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.single(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.all });
    },
  });
}