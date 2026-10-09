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

  // No automatic retry on either: a repeat of a refused check (MK015) must reach the caller, and
  // the app client's default mutation retry would otherwise run it again.
  const verify = useMutation({
    retry: false,
    mutationFn: (claim: { classId: string; canonical: string; at: string }) =>
      recordResultsVerified({ ...claim, recordedBy: user?.id ?? null }),
    onSuccess: () => toast.success('Scores marked as matching the paper'),
    onError: error => {
      toast.error(
        mappedErrorMessage(error) ??
          getUserFriendlyError(error, 'The check could not be saved. Try again.')
      );
    },
  });

  const undo = useMutation({
    retry: false,
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
    /** Saves the check for exactly the results text the caller ticked (see recordResultsVerified). */
    verifyAsync: ({ classId, canonical }: { classId: string; canonical: string }) =>
      verify.mutateAsync({ classId, canonical, at: new Date().toISOString() }),
    undo: undo.mutate,
    isPending: verify.isPending || undo.isPending,
  };
}
