import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DogsService } from '@/services/dogsService';
import { queryKeys } from '@/lib/queryClient';
import type { Dog } from '@/types/dog-types';

// Query hooks
export function useDogsQuery() {
  return useQuery({
    queryKey: queryKeys.dogs,
    queryFn: DogsService.getAll,
  });
}

export function useDogQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.dog(id),
    queryFn: () => DogsService.getById(id),
    enabled: !!id, // Only run query if id is provided
  });
}

export function useDogsByOwnerQuery(ownerId: string) {
  return useQuery({
    queryKey: queryKeys.personDogs(ownerId),
    queryFn: () => DogsService.getByOwnerId(ownerId),
    enabled: !!ownerId,
  });
}

// Mutation hooks
export function useCreateDogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DogsService.create,
    onSuccess: (newDog) => {
      // Invalidate and refetch dogs list
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
      
      // Optionally, add the new dog to the cache optimistically
      queryClient.setQueryData(queryKeys.dogs, (oldData: Dog[] | undefined) => {
        if (!oldData) return [newDog];
        return [...oldData, newDog];
      });
    },
  });
}

export function useUpdateDogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Dog> }) =>
      DogsService.update(id, updates),
    onSuccess: (updatedDog) => {
      // Update the specific dog in the cache
      queryClient.setQueryData(queryKeys.dog(updatedDog.id), updatedDog);
      
      // Update the dog in the dogs list
      queryClient.setQueryData(queryKeys.dogs, (oldData: Dog[] | undefined) => {
        if (!oldData) return [updatedDog];
        return oldData.map(dog => dog.id === updatedDog.id ? updatedDog : dog);
      });
    },
  });
}

export function useDeleteDogMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: DogsService.delete,
    onSuccess: (_, deletedId) => {
      // Remove the dog from the cache
      queryClient.removeQueries({ queryKey: queryKeys.dog(deletedId) });
      
      // Remove the dog from the dogs list
      queryClient.setQueryData(queryKeys.dogs, (oldData: Dog[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(dog => dog.id !== deletedId);
      });
    },
  });
}

// Optimistic update hooks for better UX
export function useOptimisticUpdateDog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Dog> }) =>
      DogsService.update(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.dog(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.dogs });

      // Snapshot the previous values
      const previousDog = queryClient.getQueryData(queryKeys.dog(id));
      const previousDogs = queryClient.getQueryData(queryKeys.dogs);

      // Optimistically update the cache
      if (previousDog) {
        const optimisticDog = { ...previousDog as Dog, ...updates };
        queryClient.setQueryData(queryKeys.dog(id), optimisticDog);
        
        queryClient.setQueryData(queryKeys.dogs, (oldData: Dog[] | undefined) => {
          if (!oldData) return [optimisticDog];
          return oldData.map(dog => dog.id === id ? optimisticDog : dog);
        });
      }

      // Return a context object with the snapshotted values
      return { previousDog, previousDogs };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousDog) {
        queryClient.setQueryData(queryKeys.dog(variables.id), context.previousDog);
      }
      if (context?.previousDogs) {
        queryClient.setQueryData(queryKeys.dogs, context.previousDogs);
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.dog(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
    },
  });
}