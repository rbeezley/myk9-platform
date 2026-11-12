import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { SHOW_SETTINGS_COPY } from './showSettingsErrorCopy';
import {
  type ClassVisibilityInput,
  type ShowVisibilityInput,
  type TrialVisibilityInput,
  updateClassVisibility,
  updateShowVisibility,
  updateTrialVisibility,
  visibilityKeys,
} from '@/services/database/visibility';

interface TrialVisibilityMutationInput extends TrialVisibilityInput {
  showId: string;
}

interface ClassVisibilityMutationInput extends ClassVisibilityInput {
  showId: string;
}

export function useUpdateShowVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ShowVisibilityInput) => {
      await updateShowVisibility(input, user?.id);
    },
    onSuccess: (_data: unknown, variables: ShowVisibilityInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Show visibility updated');
    },
    onError: () => {
      notifications.error(SHOW_SETTINGS_COPY.showVisibilityFailed);
    },
  });
}

export function useUpdateTrialVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: TrialVisibilityMutationInput) => {
      await updateTrialVisibility(input, user?.id);
    },
    onSuccess: (_data: unknown, variables: TrialVisibilityMutationInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Trial visibility updated');
    },
    onError: () => {
      notifications.error(SHOW_SETTINGS_COPY.trialVisibilityFailed);
    },
  });
}

export function useUpdateClassVisibility() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();

  return useMutation({
    mutationFn: async (input: ClassVisibilityMutationInput) => {
      await updateClassVisibility(input, user?.id);
    },
    onSuccess: (_data: unknown, variables: ClassVisibilityMutationInput) => {
      queryClient.invalidateQueries({ queryKey: visibilityKeys.show(variables.showId) });
      notifications.success('Class visibility updated');
    },
    onError: () => {
      notifications.error(SHOW_SETTINGS_COPY.classVisibilityFailed);
    },
  });
}
