import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { clearResultsVerified, recordResultsVerified } from './resultsVerifiedMutations';

/**
 * MYK9-1031: "scores match the paper" as React Query mutations.
 * `onSettled` receives the class id so the caller can refresh what it shows.
 */
export function useResultsVerifiedMutations({
  onSettled,
}: {
  onSettled?: (classId: string) => void;
} = {}) {
  const { user } = useAuth();

  // Offline-first (replica + queue), so it must run with no network: the app client's default
  // 'online' networkMode would pause it before the write and lose it on reload.
  const verify = useMutation({
    networkMode: 'always',
    mutationFn: ({ classId }: { classId: string }) =>
      recordResultsVerified({ classId, recordedBy: user?.id ?? null }),
    onSuccess: () => toast.success('Scores marked as matching the paper'),
    onError: error => {
      toast.error(getUserFriendlyError(error, 'The check could not be saved. Try again.'));
    },
    onSettled: (_data, _error, variables) => onSettled?.(variables.classId),
  });

  const undo = useMutation({
    networkMode: 'always',
    mutationFn: ({ classId }: { classId: string }) => clearResultsVerified(classId),
    onSuccess: () => toast.success('Check removed'),
    onError: error => {
      toast.error(getUserFriendlyError(error, 'The check could not be removed. Try again.'));
    },
    onSettled: (_data, _error, variables) => onSettled?.(variables.classId),
  });

  return {
    verify: verify.mutate,
    undo: undo.mutate,
    isPending: verify.isPending || undo.isPending,
  };
}
