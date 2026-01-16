/**
 * Show Management React Query Hooks
 * 
 * Custom hooks for managing show registration, armband, and check-in data
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
  ShowRegistration,
  Armband,
  CreateShowRegistrationData,
  UpdateShowRegistrationData,
  CreateArmbandData,
  UpdateArmbandData,
  ShowRegistrationFilters,
  ArmbandFilters,
  RegistrationSummary,
  ArmbandSummary,
  ShowManagementStats
} from '../../types/show-management';
import {
  showRegistrationQueries,
  armbandQueries,
  showManagementQueries
} from '../../services/database/queries/showManagementQueries';
import { showRegistrationMappers, armbandMappers } from '../../services/mappers/showManagementMappers';

// Query Keys
export const showRegistrationKeys = {
  all: ['showRegistrations'] as const,
  lists: () => [...showRegistrationKeys.all, 'list'] as const,
  list: (filters: ShowRegistrationFilters) => [...showRegistrationKeys.lists(), filters] as const,
  details: () => [...showRegistrationKeys.all, 'detail'] as const,
  detail: (id: string) => [...showRegistrationKeys.details(), id] as const,
  byShow: (showId: string) => [...showRegistrationKeys.all, 'byShow', showId] as const,
  byShowFiltered: (showId: string, filters: ShowRegistrationFilters) => 
    [...showRegistrationKeys.byShow(showId), filters] as const,
  byPerson: (personId: string) => [...showRegistrationKeys.all, 'byPerson', personId] as const,
  byPersonFiltered: (personId: string, filters: ShowRegistrationFilters) => 
    [...showRegistrationKeys.byPerson(personId), filters] as const,
  summary: (showId: string) => [...showRegistrationKeys.all, 'summary', showId] as const
};

export const armbandKeys = {
  all: ['armbands'] as const,
  lists: () => [...armbandKeys.all, 'list'] as const,
  list: (filters: ArmbandFilters) => [...armbandKeys.lists(), filters] as const,
  details: () => [...armbandKeys.all, 'detail'] as const,
  detail: (id: string) => [...armbandKeys.details(), id] as const,
  byShow: (showId: string) => [...armbandKeys.all, 'byShow', showId] as const,
  byShowFiltered: (showId: string, filters: ArmbandFilters) => 
    [...armbandKeys.byShow(showId), filters] as const,
  summary: (showId: string) => [...armbandKeys.all, 'summary', showId] as const
};

// Check-in functionality now handled through show_registrations and armbands tables

export const showManagementKeys = {
  all: ['showManagement'] as const,
  stats: (showId: string) => [...showManagementKeys.all, 'stats', showId] as const
};

// Show Registration Hooks
export function useShowRegistrations(
  showId: string,
  filters?: ShowRegistrationFilters,
  options?: Omit<UseQueryOptions<ShowRegistration[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      showRegistrationKeys.byShowFiltered(showId, filters) : 
      showRegistrationKeys.byShow(showId),
    queryFn: () => showRegistrationQueries.getByShowId(showId, filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options
  });
}

export function usePersonRegistrations(
  personId: string,
  filters?: ShowRegistrationFilters,
  options?: Omit<UseQueryOptions<ShowRegistration[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      showRegistrationKeys.byPersonFiltered(personId, filters) : 
      showRegistrationKeys.byPerson(personId),
    queryFn: () => showRegistrationQueries.getByPersonId(personId, filters),
    staleTime: 2 * 60 * 1000,
    enabled: !!personId,
    ...options
  });
}

export function useShowRegistration(
  id: string,
  options?: Omit<UseQueryOptions<ShowRegistration | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: showRegistrationKeys.detail(id),
    queryFn: () => showRegistrationQueries.getById(id),
    staleTime: 2 * 60 * 1000,
    enabled: !!id,
    ...options
  });
}

export function useRegistrationSummary(
  showId: string,
  options?: Omit<UseQueryOptions<RegistrationSummary>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: showRegistrationKeys.summary(showId),
    queryFn: () => showRegistrationQueries.getSummary(showId),
    staleTime: 2 * 60 * 1000,
    enabled: !!showId,
    ...options
  });
}

export function useCreateShowRegistration(
  options?: UseMutationOptions<ShowRegistration, Error, CreateShowRegistrationData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateShowRegistrationData) => {
      const errors = showRegistrationMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return showRegistrationQueries.create(data);
    },
    onSuccess: (registration) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byShow(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byPerson(registration.person_id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.summary(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(registration.show_id) });
      
      // Update the cache with the new registration
      queryClient.setQueryData(showRegistrationKeys.detail(registration.id), registration);
    },
    ...options
  });
}

export function useUpdateShowRegistration(
  options?: UseMutationOptions<ShowRegistration, Error, UpdateShowRegistrationData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateShowRegistrationData) => {
      const { id, ...updateData } = data;
      void id; // Mark as used for ESLint
      const errors = showRegistrationMappers.validate(updateData as CreateShowRegistrationData);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return showRegistrationQueries.update(data);
    },
    onSuccess: (registration) => {
      // Update the cache
      queryClient.setQueryData(showRegistrationKeys.detail(registration.id), registration);
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byShow(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byPerson(registration.person_id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.summary(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(registration.show_id) });
    },
    ...options
  });
}

export function useDeleteShowRegistration(
  options?: UseMutationOptions<void, Error, { id: string; showId: string; personId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; showId: string; personId: string }) => showRegistrationQueries.delete(id),
    onSuccess: (_, { id, showId, personId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: showRegistrationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byShow(showId) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byPerson(personId) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.summary(showId) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(showId) });
    },
    ...options
  });
}

export function useCheckInRegistration(
  options?: UseMutationOptions<ShowRegistration, Error, { registrationId: string; checkInData: { check_in_time?: string; check_in_person?: string } }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ registrationId, checkInData }: { registrationId: string; checkInData: { check_in_time?: string; check_in_person?: string } }) => 
      showRegistrationQueries.checkIn(registrationId, checkInData),
    onSuccess: (registration) => {
      // Update the cache
      queryClient.setQueryData(showRegistrationKeys.detail(registration.id), registration);
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byShow(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showRegistrationKeys.summary(registration.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(registration.show_id) });
    },
    ...options
  });
}

// Armband Hooks
export function useArmbands(
  showId: string,
  filters?: ArmbandFilters,
  options?: Omit<UseQueryOptions<Armband[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: filters ? 
      armbandKeys.byShowFiltered(showId, filters) : 
      armbandKeys.byShow(showId),
    queryFn: () => armbandQueries.getByShowId(showId, filters),
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options
  });
}

export function useArmband(
  id: string,
  options?: Omit<UseQueryOptions<Armband | null>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: armbandKeys.detail(id),
    queryFn: () => armbandQueries.getById(id),
    staleTime: 2 * 60 * 1000,
    enabled: !!id,
    ...options
  });
}

export function useArmbandSummary(
  showId: string,
  options?: Omit<UseQueryOptions<ArmbandSummary>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: armbandKeys.summary(showId),
    queryFn: () => armbandQueries.getSummary(showId),
    staleTime: 2 * 60 * 1000,
    enabled: !!showId,
    ...options
  });
}

export function useCreateArmband(
  options?: UseMutationOptions<Armband, Error, CreateArmbandData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateArmbandData) => {
      const errors = armbandMappers.validate(data);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return armbandQueries.create(data);
    },
    onSuccess: (armband) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(armband.show_id) });
      
      // Update the cache with the new armband
      queryClient.setQueryData(armbandKeys.detail(armband.id), armband);
    },
    ...options
  });
}

export function useUpdateArmband(
  options?: UseMutationOptions<Armband, Error, UpdateArmbandData>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateArmbandData) => {
      const { id, ...updateData } = data;
      void id; // Mark as used for ESLint
      const errors = armbandMappers.validate(updateData as CreateArmbandData);
      if (errors.length > 0) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      return armbandQueries.update(data);
    },
    onSuccess: (armband) => {
      // Update the cache
      queryClient.setQueryData(armbandKeys.detail(armband.id), armband);
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(armband.show_id) });
    },
    ...options
  });
}

export function useDeleteArmband(
  options?: UseMutationOptions<void, Error, { id: string; showId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; showId: string }) => armbandQueries.delete(id),
    onSuccess: (_, { id, showId }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: armbandKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(showId) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(showId) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(showId) });
    },
    ...options
  });
}

export function useAssignArmband(
  options?: UseMutationOptions<Armband, Error, { armbandId: string; registrationId: string }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ armbandId, registrationId }: { armbandId: string; registrationId: string }) => 
      armbandQueries.assign(armbandId, registrationId),
    onSuccess: (armband) => {
      // Update the cache
      queryClient.setQueryData(armbandKeys.detail(armband.id), armband);
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(armband.show_id) });
    },
    ...options
  });
}

export function useMarkArmbandPrinted(
  options?: UseMutationOptions<Armband, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (armbandId: string) => armbandQueries.markPrinted(armbandId),
    onSuccess: (armband) => {
      // Update the cache
      queryClient.setQueryData(armbandKeys.detail(armband.id), armband);
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(armband.show_id) });
    },
    ...options
  });
}

export function useCheckInArmband(
  options?: UseMutationOptions<Armband, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (armbandId: string) => armbandQueries.checkIn(armbandId),
    onSuccess: (armband) => {
      // Update the cache
      queryClient.setQueryData(armbandKeys.detail(armband.id), armband);
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(armband.show_id) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(armband.show_id) });
    },
    ...options
  });
}

// Batch Armband Operations
export function useBatchCreateArmbands(
  options?: UseMutationOptions<Armband[], Error, { showId: string; armbands: CreateArmbandData[] }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ armbands }: { showId: string; armbands: CreateArmbandData[] }) => {
      // Validate all armbands before creating
      for (const armband of armbands) {
        const errors = armbandMappers.validate(armband);
        if (errors.length > 0) {
          throw new Error(`Validation failed for armband ${armband.armband_number}: ${errors.join(', ')}`);
        }
      }
      return armbandQueries.batchCreate(armbands);
    },
    onSuccess: (_, { showId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(showId) });
      queryClient.invalidateQueries({ queryKey: armbandKeys.summary(showId) });
      queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(showId) });
    },
    ...options
  });
}

// Check-in record functionality now handled through show registrations and armbands
// Use useCheckInRegistration and useCheckInArmband instead

// Show Management Stats Hook
export function useShowManagementStats(
  showId: string,
  options?: Omit<UseQueryOptions<ShowManagementStats>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: showManagementKeys.stats(showId),
    queryFn: () => showManagementQueries.getShowManagementStats(showId),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!showId,
    ...options
  });
}

// Utility Hooks
export function useInvalidateShowManagementData(showId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: showRegistrationKeys.byShow(showId) });
    queryClient.invalidateQueries({ queryKey: armbandKeys.byShow(showId) });
    // Check-in data now tracked through registrations and armbands
    queryClient.invalidateQueries({ queryKey: showManagementKeys.stats(showId) });
  };
}

export function usePrefetchShowManagementData(showId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.prefetchQuery({
      queryKey: showRegistrationKeys.byShow(showId),
      queryFn: () => showRegistrationQueries.getByShowId(showId),
      staleTime: 2 * 60 * 1000
    });
    
    queryClient.prefetchQuery({
      queryKey: armbandKeys.byShow(showId),
      queryFn: () => armbandQueries.getByShowId(showId),
      staleTime: 2 * 60 * 1000
    });
    
    queryClient.prefetchQuery({
      queryKey: showManagementKeys.stats(showId),
      queryFn: () => showManagementQueries.getShowManagementStats(showId),
      staleTime: 2 * 60 * 1000
    });
  };
}