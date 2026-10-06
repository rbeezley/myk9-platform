import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';
import { showUndoToast } from '@/lib/undoToast';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { judgeSignOffWording } from './judgeSignOff';
import {
  clearJudgeSignOffs,
  recordJudgeDaySignOff,
  type JudgeSignOffOutcome,
} from './judgeSignOffMutations';

export interface JudgeSignOffMutationInput {
  classIds: readonly string[];
  registryId?: string | null | undefined;
}

function failedDescription(outcome: JudgeSignOffOutcome): string | undefined {
  const count = outcome.failed.length;
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? 'class' : 'classes'} could not be saved. Try again.`;
}

/**
 * MYK9-1030: the judge's sign-off as React Query mutations, with registry-worded toasts.
 * Recording offers Undo (clears exactly the classes it wrote); `clear` is the per-class undo.
 * `onSettled` receives the affected class ids so the caller can invalidate its queries.
 */
export function useJudgeSignOffMutations({
  onSettled,
}: {
  onSettled: (classIds: readonly string[]) => void;
}) {
  const { user } = useAuth();

  // Offline-first (replica + queue), so it must run with no network: the app client's default
  // 'online' networkMode would pause it before the write and lose it on reload.
  const clear = useMutation({
    networkMode: 'always',
    mutationFn: async ({ classIds }: JudgeSignOffMutationInput) => {
      const outcome = await clearJudgeSignOffs(classIds);
      if (outcome.recorded.length === 0) {
        throw new Error('The sign-off could not be removed. Try again.');
      }
      return outcome;
    },
    onSuccess: (outcome, { registryId }) => {
      const description = failedDescription(outcome);
      toast.success(judgeSignOffWording(registryId).undoneMessage, {
        ...(description ? { description } : {}),
      });
    },
    onError: error => {
      toast.error(getUserFriendlyError(error, 'The sign-off could not be removed. Try again.'));
    },
    onSettled: (_data, _error, variables) => onSettled(variables.classIds),
  });

  const record = useMutation({
    networkMode: 'always',
    mutationFn: async ({ classIds }: JudgeSignOffMutationInput) => {
      const outcome = await recordJudgeDaySignOff({ classIds, recordedBy: user?.id ?? null });
      if (outcome.recorded.length === 0) {
        throw new Error('The sign-off could not be recorded. Try again.');
      }
      return outcome;
    },
    onSuccess: (outcome, { registryId }) => {
      const description = failedDescription(outcome);
      showUndoToast({
        message: judgeSignOffWording(registryId).recordedMessage(outcome.recorded.length),
        ...(description ? { description } : {}),
        onUndo: () => clear.mutate({ classIds: outcome.recorded, registryId }),
      });
    },
    onError: error => {
      toast.error(getUserFriendlyError(error, 'The sign-off could not be recorded. Try again.'));
    },
    onSettled: (_data, _error, variables) => onSettled(variables.classIds),
  });

  return {
    recordSignOff: record.mutate,
    clearSignOff: clear.mutate,
    isPending: record.isPending || clear.isPending,
  };
}
