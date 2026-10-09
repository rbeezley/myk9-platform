import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';
import { getUserFriendlyError, mappedErrorMessage } from '@/utils/errorMessages';
import { clearResultsVerified, recordResultsVerified } from './resultsVerifiedMutations';

/**
 * MYK9-1031: "scores match the paper" as React Query mutations. Online only (the default
 * networkMode pauses them offline; the Results tab also disables the buttons): the check is saved
 * by calling the server, never queued. `verifyAsync` rejects so the caller can reset its ticks
 * when the server says the scores moved (MK015).
 */
export function useResultsVerifiedMutations() {
  const { user } = useAuth();

  const verify = useMutation({
    mutationFn: ({ classId }: { classId: string }) =>
      recordResultsVerified({ classId, recordedBy: user?.id ?? null }),
    onSuccess: () => toast.success('Scores marked as matching the paper'),
    onError: error => {
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The check could not be saved. Try again.')
      );
    },
  });

  const undo = useMutation({
    mutationFn: ({ classId }: { classId: string }) => clearResultsVerified(classId),
    onSuccess: () => toast.success('Check removed'),
    onError: error => {
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The check could not be removed. Try again.')
      );
    },
  });

  return {
    verifyAsync: verify.mutateAsync,
    undo: undo.mutate,
    isPending: verify.isPending || undo.isPending,
  };
}
