import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { getUserFriendlyError } from '@/utils/errorMessages';
import type { ShowMapAction } from './showMapActions';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import {
  markShowMapEntryCheckedIn,
  sourceIdFromShowMapNodeId,
} from './showMapActionMutations';

interface UseShowMapActionExecutorInput {
  showId: string;
}

interface MutationInput {
  action: ShowMapAction;
  execution: Extract<ExecutableShowMapActionExecution, { kind: 'mutation' }>;
}

export function useShowMapActionExecutor({ showId }: UseShowMapActionExecutorInput) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ action, execution }: MutationInput) => {
      if (execution.mutation !== 'mark-checked-in') return;

      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      await markShowMapEntryCheckedIn(entryId);
    },
    onSuccess: (_data, { execution }) => {
      toast.success(execution.successMessage);
      queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(showId) });
      queryClient.invalidateQueries({ queryKey: ['show-day'] });
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
  });

  const executeAction = useCallback(
    (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => {
      if (execution.kind === 'mutation') {
        mutation.mutate({ action, execution });
      }
    },
    [mutation]
  );

  return {
    executeAction,
    isExecuting: mutation.isPending,
  };
}
