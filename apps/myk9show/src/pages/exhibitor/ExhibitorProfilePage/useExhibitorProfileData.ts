/**
 * Data hook for Exhibitor Profile Page
 *
 * Manages profile and dogs data with React Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  exhibitorService,
  UpdatePersonData,
  CreateDogData,
  ExhibitorDog,
} from '@/services/exhibitorService';
import { logger } from '@/services/LoggingService';

export interface UseExhibitorProfileDataReturn {
  // User
  user: { id: string } | null;

  // Profile data
  profile: Awaited<ReturnType<typeof exhibitorService.getProfile>> | undefined;
  profileLoading: boolean;

  // Dogs data
  dogs: ExhibitorDog[];
  dogsLoading: boolean;

  // Mutations
  updatePerson: (updates: UpdatePersonData) => void;
  updatePersonAsync: (updates: UpdatePersonData) => Promise<void>;
  isUpdatingPerson: boolean;

  createDog: (data: CreateDogData) => void;
  isCreatingDog: boolean;

  updateDog: (dogId: string, data: Partial<CreateDogData>) => void;
  isUpdatingDog: boolean;

  deleteDog: (dogId: string) => void;
  isDeletingDog: boolean;
}

export function useExhibitorProfileData(): UseExhibitorProfileDataReturn {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  // Fetch profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['exhibitorProfile', user?.id],
    queryFn: () => exhibitorService.getProfile(user!.id),
    enabled: !!user?.id,
  });

  // Fetch dogs
  const { data: dogs = [], isLoading: dogsLoading } = useQuery({
    queryKey: ['exhibitorDogs', profile?.person_id],
    queryFn: () => exhibitorService.getDogs(profile!.person_id),
    enabled: !!profile?.person_id,
  });

  // Update person mutation
  const updatePersonMutation = useMutation({
    mutationFn: (updates: UpdatePersonData) =>
      exhibitorService.updatePerson(profile!.person_id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorProfile'] });
    },
    onError: (error) => {
      logger.error('Failed to update person', 'exhibitor-profile', undefined, error as Error);
    },
  });

  // Create dog mutation
  const createDogMutation = useMutation({
    mutationFn: (data: CreateDogData) => exhibitorService.createDog(profile!.person_id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
    },
  });

  // Update dog mutation
  const updateDogMutation = useMutation({
    mutationFn: ({ dogId, data }: { dogId: string; data: Partial<CreateDogData> }) =>
      exhibitorService.updateDog(dogId, profile!.person_id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
    },
  });

  // Delete dog mutation
  const deleteDogMutation = useMutation({
    mutationFn: (dogId: string) => exhibitorService.deleteDog(dogId, profile!.person_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibitorDogs'] });
    },
  });

  return {
    user,
    profile,
    profileLoading,
    dogs,
    dogsLoading,

    updatePerson: (updates) => updatePersonMutation.mutate(updates),
    updatePersonAsync: async (updates) => {
      await updatePersonMutation.mutateAsync(updates);
    },
    isUpdatingPerson: updatePersonMutation.isPending,

    createDog: (data) => createDogMutation.mutate(data),
    isCreatingDog: createDogMutation.isPending,

    updateDog: (dogId, data) => updateDogMutation.mutate({ dogId, data }),
    isUpdatingDog: updateDogMutation.isPending,

    deleteDog: (dogId) => deleteDogMutation.mutate(dogId),
    isDeletingDog: deleteDogMutation.isPending,
  };
}
