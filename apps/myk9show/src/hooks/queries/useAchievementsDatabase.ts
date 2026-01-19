/**
 * Achievement React Query Hooks
 *
 * Custom hooks for managing achievement data with React Query caching,
 * optimistic updates, and error handling.
 *
 * Note: Competition and PastResult hooks were removed because the corresponding
 * database tables don't exist. The UI uses local Zustand stores instead.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions
} from '@tanstack/react-query';
import {
  Achievement,
  CreateAchievementData,
  UpdateAchievementData,
  AchievementFilters,
  AchievementSummary,
} from '../../types/achievement';
import { achievementQueries } from '../../services/database/queries/achievementQueries';
import { achievementMappers } from '../../services/mappers/achievementMappers';

// Query Keys
export const achievementKeys = {
  all: ['achievements'] as const,
  lists: () => [...achievementKeys.all, 'list'] as const,
  list: (filters: AchievementFilters) => [...achievementKeys.lists(), filters] as const,
  details: () => [...achievementKeys.all, 'detail'] as const,
  detail: (id: string) => [...achievementKeys.details(), id] as const,
  byDog: (dogId: string) => [...achievementKeys.all, 'byDog', dogId] as const,
  byDogFiltered: (dogId: string, filters: AchievementFilters) =>
    [...achievementKeys.byDog(dogId), filters] as const,
  summary: (dogId: string) => [...achievementKeys.all, 'summary', dogId] as const
};

// Achievement Hooks
export function useAchievements(
  dogId: string,
  filters?: AchievementFilters,
  options?: Omit<UseQueryOptions<Achievement[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ?
      achievementKeys.byDogFiltered(dogId, filters) :
      achievementKeys.byDog(dogId),
    queryFn: () => achievementQueries.getByDogId(dogId, filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options
  });
}

export function useAchievement(
  id: string,
  options?: Omit<UseQueryOptions<Achievement | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: achievementKeys.detail(id),
    queryFn: () => achievementQueries.getById(id),
    staleTime: 5 * 60 * 1000,
    enabled: !!id,
    ...options
  });
}

export function useAchievementSummary(
  dogId: string,
  options?: Omit<UseQueryOptions<AchievementSummary>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: achievementKeys.summary(dogId),
    queryFn: () => achievementQueries.getSummary(dogId),
    staleTime: 5 * 60 * 1000,
    enabled: !!dogId,
    ...options
  });
}

export function useCreateAchievement(
  options?: UseMutationOptions<Achievement, Error, CreateAchievementData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAchievementData) => {
      const errors = achievementMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return achievementQueries.create(data);
    },
    onSuccess: (achievement) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: achievementKeys.byDog(achievement.dog_id) });
      queryClient.invalidateQueries({ queryKey: achievementKeys.summary(achievement.dog_id) });

      // Update the cache with the new achievement
      queryClient.setQueryData(achievementKeys.detail(achievement.id), achievement);
    },
    ...options
  });
}

export function useUpdateAchievement(
  options?: UseMutationOptions<Achievement, Error, UpdateAchievementData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateAchievementData) => {
      const { id, ...updateData } = data;
      void id; // Mark as used for ESLint
      const errors = achievementMappers.validate(updateData as CreateAchievementData);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return achievementQueries.update(data);
    },
    onSuccess: (achievement) => {
      // Update the cache
      queryClient.setQueryData(achievementKeys.detail(achievement.id), achievement);
      queryClient.invalidateQueries({ queryKey: achievementKeys.byDog(achievement.dog_id) });
      queryClient.invalidateQueries({ queryKey: achievementKeys.summary(achievement.dog_id) });
    },
    ...options
  });
}

export function useDeleteAchievement(
  options?: UseMutationOptions<void, Error, { id: string; dogId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; dogId: string }) => achievementQueries.delete(id),
    onSuccess: (_, { id, dogId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: achievementKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: achievementKeys.byDog(dogId) });
      queryClient.invalidateQueries({ queryKey: achievementKeys.summary(dogId) });
    },
    ...options
  });
}

// Utility Hooks
export function useInvalidateAchievementData(dogId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: achievementKeys.byDog(dogId) });
  };
}

export function usePrefetchAchievementData(dogId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: achievementKeys.byDog(dogId),
      queryFn: () => achievementQueries.getByDogId(dogId),
      staleTime: 5 * 60 * 1000
    });
  };
}
