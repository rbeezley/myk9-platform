/**
 * Achievement and Competition React Query Hooks
 * 
 * Custom hooks for managing achievement, competition, and past result data
 * with React Query caching, optimistic updates, and error handling.
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
  Competition,
  PastResult,
  CreateAchievementData,
  UpdateAchievementData,
  CreateCompetitionData,
  UpdateCompetitionData,
  CreatePastResultData,
  UpdatePastResultData,
  AchievementFilters,
  CompetitionFilters,
  PastResultFilters,
  AchievementSummary,
  CompetitionSummary,
  PerformanceStats
} from '../../types/achievement';
import {
  achievementQueries,
  competitionQueries,
  pastResultQueries,
  performanceQueries
} from '../../services/database/queries/achievementQueries';
import { achievementMappers, competitionMappers, pastResultMappers } from '../../services/mappers/achievementMappers';

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

export const competitionKeys = {
  all: ['competitions'] as const,
  lists: () => [...competitionKeys.all, 'list'] as const,
  list: (filters: CompetitionFilters) => [...competitionKeys.lists(), filters] as const,
  details: () => [...competitionKeys.all, 'detail'] as const,
  detail: (id: string) => [...competitionKeys.details(), id] as const,
  byDog: (dogId: string) => [...competitionKeys.all, 'byDog', dogId] as const,
  byDogFiltered: (dogId: string, filters: CompetitionFilters) => 
    [...competitionKeys.byDog(dogId), filters] as const,
  summary: (dogId: string) => [...competitionKeys.all, 'summary', dogId] as const
};

export const pastResultKeys = {
  all: ['pastResults'] as const,
  lists: () => [...pastResultKeys.all, 'list'] as const,
  list: (filters: PastResultFilters) => [...pastResultKeys.lists(), filters] as const,
  details: () => [...pastResultKeys.all, 'detail'] as const,
  detail: (id: string) => [...pastResultKeys.details(), id] as const,
  byDog: (dogId: string) => [...pastResultKeys.all, 'byDog', dogId] as const,
  byDogFiltered: (dogId: string, filters: PastResultFilters) => 
    [...pastResultKeys.byDog(dogId), filters] as const
};

export const performanceKeys = {
  all: ['performance'] as const,
  stats: (dogId: string) => [...performanceKeys.all, 'stats', dogId] as const
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
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(achievement.dog_id) });
      
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
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(achievement.dog_id) });
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
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(dogId) });
    },
    ...options
  });
}

// Competition Hooks
export function useCompetitions(
  dogId: string,
  filters?: CompetitionFilters,
  options?: Omit<UseQueryOptions<Competition[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      competitionKeys.byDogFiltered(dogId, filters) : 
      competitionKeys.byDog(dogId),
    queryFn: () => competitionQueries.getByDogId(dogId, filters),
    staleTime: 2 * 60 * 1000, // 2 minutes (more dynamic than achievements)
    ...options
  });
}

export function useCompetition(
  id: string,
  options?: Omit<UseQueryOptions<Competition | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: competitionKeys.detail(id),
    queryFn: () => competitionQueries.getById(id),
    staleTime: 2 * 60 * 1000,
    enabled: !!id,
    ...options
  });
}

export function useCompetitionSummary(
  dogId: string,
  options?: Omit<UseQueryOptions<CompetitionSummary>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: competitionKeys.summary(dogId),
    queryFn: () => competitionQueries.getSummary(dogId),
    staleTime: 2 * 60 * 1000,
    enabled: !!dogId,
    ...options
  });
}

export function useCreateCompetition(
  options?: UseMutationOptions<Competition, Error, CreateCompetitionData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCompetitionData) => {
      const errors = competitionMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return competitionQueries.create(data);
    },
    onSuccess: (competition) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: competitionKeys.byDog(competition.dog_id) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.summary(competition.dog_id) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(competition.dog_id) });
      
      // Update the cache with the new competition
      queryClient.setQueryData(competitionKeys.detail(competition.id), competition);
    },
    ...options
  });
}

export function useUpdateCompetition(
  options?: UseMutationOptions<Competition, Error, UpdateCompetitionData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateCompetitionData) => {
      const { id, ...updateData } = data;
      void id; // Mark as used for ESLint
      const errors = competitionMappers.validate(updateData as CreateCompetitionData);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return competitionQueries.update(data);
    },
    onSuccess: (competition) => {
      // Update the cache
      queryClient.setQueryData(competitionKeys.detail(competition.id), competition);
      queryClient.invalidateQueries({ queryKey: competitionKeys.byDog(competition.dog_id) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.summary(competition.dog_id) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(competition.dog_id) });
    },
    ...options
  });
}

export function useDeleteCompetition(
  options?: UseMutationOptions<void, Error, { id: string; dogId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; dogId: string }) => competitionQueries.delete(id),
    onSuccess: (_, { id, dogId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: competitionKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.byDog(dogId) });
      queryClient.invalidateQueries({ queryKey: competitionKeys.summary(dogId) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(dogId) });
    },
    ...options
  });
}

// Past Results Hooks
export function usePastResults(
  dogId: string,
  filters?: PastResultFilters,
  options?: Omit<UseQueryOptions<PastResult[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      pastResultKeys.byDogFiltered(dogId, filters) : 
      pastResultKeys.byDog(dogId),
    queryFn: () => pastResultQueries.getByDogId(dogId, filters),
    staleTime: 10 * 60 * 1000, // 10 minutes (historical data changes less frequently)
    ...options
  });
}

export function usePastResult(
  id: string,
  options?: Omit<UseQueryOptions<PastResult | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: pastResultKeys.detail(id),
    queryFn: () => pastResultQueries.getById(id),
    staleTime: 10 * 60 * 1000,
    enabled: !!id,
    ...options
  });
}

export function useCreatePastResult(
  options?: UseMutationOptions<PastResult, Error, CreatePastResultData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePastResultData) => {
      const errors = pastResultMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return pastResultQueries.create(data);
    },
    onSuccess: (pastResult) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: pastResultKeys.byDog(pastResult.dog_id) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(pastResult.dog_id) });
      
      // Update the cache with the new past result
      queryClient.setQueryData(pastResultKeys.detail(pastResult.id), pastResult);
    },
    ...options
  });
}

export function useUpdatePastResult(
  options?: UseMutationOptions<PastResult, Error, UpdatePastResultData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePastResultData) => {
      const { id, ...updateData } = data;
      void id; // Mark as used for ESLint
      const errors = pastResultMappers.validate(updateData as CreatePastResultData);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return pastResultQueries.update(data);
    },
    onSuccess: (pastResult) => {
      // Update the cache
      queryClient.setQueryData(pastResultKeys.detail(pastResult.id), pastResult);
      queryClient.invalidateQueries({ queryKey: pastResultKeys.byDog(pastResult.dog_id) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(pastResult.dog_id) });
    },
    ...options
  });
}

export function useDeletePastResult(
  options?: UseMutationOptions<void, Error, { id: string; dogId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; dogId: string }) => pastResultQueries.delete(id),
    onSuccess: (_, { id, dogId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: pastResultKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: pastResultKeys.byDog(dogId) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(dogId) });
    },
    ...options
  });
}

// Batch Import Hook
export function useBatchImportPastResults(
  options?: UseMutationOptions<PastResult[], Error, { dogId: string; results: CreatePastResultData[] }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ results }: { dogId: string; results: CreatePastResultData[] }) => {
      // Validate all results before importing
      for (const result of results) {
        const errors = pastResultMappers.validate(result);
        if (errors.length > 0) {
          throw new Error(`Validation failed for ${result.show_name}: ${errors.join(', ')}`);
        }
      }
      return pastResultQueries.batchImport(results);
    },
    onSuccess: (_, { dogId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: pastResultKeys.byDog(dogId) });
      queryClient.invalidateQueries({ queryKey: performanceKeys.stats(dogId) });
    },
    ...options
  });
}

// Performance Stats Hook
export function usePerformanceStats(
  dogId: string,
  options?: Omit<UseQueryOptions<PerformanceStats>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: performanceKeys.stats(dogId),
    queryFn: () => performanceQueries.getPerformanceStats(dogId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!dogId,
    ...options
  });
}

// Utility Hooks
export function useInvalidateAchievementData(dogId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: achievementKeys.byDog(dogId) });
    queryClient.invalidateQueries({ queryKey: competitionKeys.byDog(dogId) });
    queryClient.invalidateQueries({ queryKey: pastResultKeys.byDog(dogId) });
    queryClient.invalidateQueries({ queryKey: performanceKeys.stats(dogId) });
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
    
    queryClient.prefetchQuery({
      queryKey: competitionKeys.byDog(dogId),
      queryFn: () => competitionQueries.getByDogId(dogId),
      staleTime: 2 * 60 * 1000
    });
    
    queryClient.prefetchQuery({
      queryKey: performanceKeys.stats(dogId),
      queryFn: () => performanceQueries.getPerformanceStats(dogId),
      staleTime: 5 * 60 * 1000
    });
  };
}