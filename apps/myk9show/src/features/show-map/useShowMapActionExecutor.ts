import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { getUserFriendlyError } from '@/utils/errorMessages';
import {
  bulkUpdateEntryStatus,
  updateEntryStatus,
} from '@/services/database/entries/secretary';
import { useMessageStore } from '@/store/messageStore';
import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';
import type { ShowDayDetailRow } from '@/types/show-day-types';
import type { ShowMapAction } from './showMapActions';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import {
  getShowMapHandlerMessageTarget,
  markShowMapClassComplete,
  markShowMapClassStarted,
  markShowMapEntryCheckedIn,
  moveUpShowMapEntry,
  scratchShowMapEntry,
  sourceIdFromShowMapNodeId,
  undoShowMapMoveUp,
  type ShowMapMoveUpResult,
  type ShowMapMoveUpUndoInput,
} from './showMapActionMutations';

interface UseShowMapActionExecutorInput {
  showId: string;
}

interface MutationInput {
  action: ShowMapAction;
  execution: Extract<ExecutableShowMapActionExecution, { kind: 'mutation' }>;
}

export interface ConfirmShowMapMoveUpInput {
  targetClassId: string;
  reason?: string | undefined;
}

export interface ConfirmShowMapMessageInput {
  body: string;
}

export interface LastShowMapMoveUp extends ShowMapMoveUpUndoInput {
  entryLabel: string;
  targetClassName: string | null;
  targetClassId: string;
  classId?: string | undefined;
}

export const MOVE_UP_UNDO_BANNER_TIMEOUT_MS = 8000;

function markRowCheckedIn<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  entryId: string
) {
  if (!rows) return rows;
  return rows.map(row =>
    row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row
  ) as T[];
}

function markShowDayDetailsCheckedIn(
  rows: ShowDayDetailRow[] | undefined,
  entryId: string
): ShowDayDetailRow[] | undefined {
  if (!rows) return rows;
  return rows.map(row => (row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row));
}

function markCheckInReportCheckedIn(
  groups: ExhibitorCheckInGroup[] | undefined,
  entryId: string
): ExhibitorCheckInGroup[] | undefined {
  if (!groups) return groups;
  return groups.map(group => {
    if (!group.entries.some(entry => entry.entryId === entryId)) return group;

    const entries = group.entries.map(entry =>
      entry.entryId === entryId ? { ...entry, checkInStatus: 'checked-in' } : entry
    );
    const checkedInCount = entries.filter(
      entry => entry.checkInStatus !== 'no-status' && !!entry.checkInStatus
    ).length;
    const allCheckedIn = checkedInCount === entries.length;
    const noneCheckedIn = checkedInCount === 0;

    return {
      ...group,
      entries,
      checkedInCount,
      summaryStatus: allCheckedIn ? 'checked-in' : noneCheckedIn ? 'none' : 'partial',
    };
  });
}

export function useShowMapActionExecutor({ showId }: UseShowMapActionExecutorInput) {
  const queryClient = useQueryClient();
  const [scratchAction, setScratchAction] = useState<ShowMapAction | null>(null);
  const [moveUpAction, setMoveUpAction] = useState<ShowMapAction | null>(null);
  const [messageAction, setMessageAction] = useState<ShowMapAction | null>(null);
  const [reviewAction, setReviewAction] = useState<ShowMapAction | null>(null);
  const [lastMoveUp, setLastMoveUp] = useState<LastShowMapMoveUp | null>(null);
  const moveUpClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getOrCreateThread = useMessageStore(s => s.getOrCreateThread);
  const sendMessage = useMessageStore(s => s.sendMessage);

  const clearPendingMoveUpTimeout = useCallback(() => {
    if (moveUpClearTimeoutRef.current !== null) {
      clearTimeout(moveUpClearTimeoutRef.current);
      moveUpClearTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (moveUpClearTimeoutRef.current !== null) {
        clearTimeout(moveUpClearTimeoutRef.current);
        moveUpClearTimeoutRef.current = null;
      }
    };
  }, []);

  const invalidateShowMapActionQueries = useCallback(
    (classId?: string | undefined, trialId?: string | undefined) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.show(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.showClasses(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.showEntries(showId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.checkInReport(showId) });
      queryClient.invalidateQueries({ queryKey: ['show-day'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.entries });
      if (classId) {
        queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.classEntries(classId) });
        queryClient.invalidateQueries({ queryKey: ['classes', classId, 'entries'] });
      }
      if (trialId) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
      }
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
    },
    [queryClient, showId]
  );

  const mutation = useMutation({
    mutationFn: async ({ action, execution }: MutationInput) => {
      if (
        execution.mutation === 'mark-class-started' ||
        execution.mutation === 'mark-class-complete'
      ) {
        if (!action.classId) throw new Error('Unable to find the class for this action.');
        if (execution.mutation === 'mark-class-started') {
          await markShowMapClassStarted(action.classId);
          return;
        }
        await markShowMapClassComplete(action.classId);
        return;
      }

      if (execution.mutation !== 'mark-checked-in') return;

      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      await markShowMapEntryCheckedIn(entryId);
    },
    onMutate: async ({ action, execution }) => {
      if (execution.mutation !== 'mark-checked-in') return {};

      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) return {};

      const classId = action.classId;
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.showEntries(showId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.entries }),
        queryClient.cancelQueries({ queryKey: queryKeys.checkInReport(showId) }),
        queryClient.cancelQueries({ queryKey: ['show-day'] }),
        ...(classId
          ? [
              queryClient.cancelQueries({ queryKey: queryKeys.classEntries(classId) }),
              queryClient.cancelQueries({ queryKey: ['classes', classId, 'entries'] }),
            ]
          : []),
      ]);

      const previousShowEntries = queryClient.getQueryData<Record<string, unknown>[]>(
        queryKeys.showEntries(showId)
      );
      const previousEntries = queryClient.getQueriesData<Record<string, unknown>[]>({
        queryKey: queryKeys.entries,
      });
      const previousCheckInReport = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
        queryKeys.checkInReport(showId)
      );
      const previousShowDayDetails = queryClient.getQueriesData<ShowDayDetailRow[]>({
        queryKey: ['show-day', 'details'],
      });
      const previousClassEntries = classId
        ? queryClient.getQueryData<Record<string, unknown>[]>(queryKeys.classEntries(classId))
        : undefined;
      const previousLegacyClassEntries = classId
        ? queryClient.getQueriesData<Record<string, unknown>[]>({
            queryKey: ['classes', classId, 'entries'],
          })
        : [];

      queryClient.setQueryData<Record<string, unknown>[]>(queryKeys.showEntries(showId), rows =>
        markRowCheckedIn(rows, entryId)
      );
      queryClient.setQueriesData<Record<string, unknown>[]>({ queryKey: queryKeys.entries }, rows =>
        markRowCheckedIn(rows, entryId)
      );
      queryClient.setQueryData<ExhibitorCheckInGroup[]>(queryKeys.checkInReport(showId), groups =>
        markCheckInReportCheckedIn(groups, entryId)
      );
      queryClient.setQueriesData<ShowDayDetailRow[]>({ queryKey: ['show-day', 'details'] }, rows =>
        markShowDayDetailsCheckedIn(rows, entryId)
      );
      if (classId) {
        queryClient.setQueryData<Record<string, unknown>[]>(queryKeys.classEntries(classId), rows =>
          markRowCheckedIn(rows, entryId)
        );
        queryClient.setQueriesData<Record<string, unknown>[]>(
          { queryKey: ['classes', classId, 'entries'] },
          rows => markRowCheckedIn(rows, entryId)
        );
      }

      return {
        previousShowEntries,
        previousEntries,
        previousCheckInReport,
        previousShowDayDetails,
        previousClassEntries,
        previousLegacyClassEntries,
      };
    },
    onSuccess: (_data, { execution }) => {
      toast.success(execution.successMessage);
    },
    onError: (error, _variables, context) => {
      if (context?.previousShowEntries) {
        queryClient.setQueryData(queryKeys.showEntries(showId), context.previousShowEntries);
      }
      if (context?.previousEntries) {
        for (const [key, data] of context.previousEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousCheckInReport) {
        queryClient.setQueryData(queryKeys.checkInReport(showId), context.previousCheckInReport);
      }
      if (context?.previousShowDayDetails) {
        for (const [key, data] of context.previousShowDayDetails) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousClassEntries && _variables.action.classId) {
        queryClient.setQueryData(
          queryKeys.classEntries(_variables.action.classId),
          context.previousClassEntries
        );
      }
      if (context?.previousLegacyClassEntries) {
        for (const [key, data] of context.previousLegacyClassEntries) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.action.classId, variables?.action.trialId);
    },
  });

  const scratchMutation = useMutation({
    mutationFn: async ({
      action,
      reason,
    }: {
      action: ShowMapAction;
      reason?: string | undefined;
    }) => {
      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      await scratchShowMapEntry(entryId, reason);
    },
    onSuccess: () => {
      toast.success('Entry marked pulled');
      setScratchAction(null);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.action.classId);
    },
  });

  const undoMoveUpMutation = useMutation({
    mutationFn: async (input: LastShowMapMoveUp) => undoShowMapMoveUp(input),
    onMutate: () => {
      // Cancel the auto-dismiss the moment the user engages with Undo. If the
      // network call later fails, the banner stays visible (user can retry)
      // instead of vanishing under them when the original timer fires.
      clearPendingMoveUpTimeout();
    },
    onSuccess: () => {
      toast.success('Move-up undone');
      setLastMoveUp(null);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.classId);
      invalidateShowMapActionQueries(variables?.targetClassId);
    },
  });

  const moveUpMutation = useMutation({
    mutationFn: async ({
      action,
      targetClassId,
      reason,
    }: {
      action: ShowMapAction;
      targetClassId: string;
      reason?: string | undefined;
    }): Promise<ShowMapMoveUpResult> => {
      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      return moveUpShowMapEntry({ entryId, targetClassId, reason });
    },
    onSuccess: (result, { action, targetClassId }) => {
      const nextLastMoveUp = {
        originalEntryId: result.originalEntryId,
        newEntryId: result.newEntryId,
        previousEntryStatus: result.previousEntryStatus,
        previousCheckInStatus: result.previousCheckInStatus,
        previousSpecialRequests: result.previousSpecialRequests,
        entryLabel: action.label,
        targetClassName: result.targetClassName,
        targetClassId,
        classId: action.classId,
      };
      clearPendingMoveUpTimeout();
      setLastMoveUp(nextLastMoveUp);
      moveUpClearTimeoutRef.current = setTimeout(() => {
        moveUpClearTimeoutRef.current = null;
        setLastMoveUp(null);
      }, MOVE_UP_UNDO_BANNER_TIMEOUT_MS);
      setMoveUpAction(null);
      toast.success('Entry moved up');
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.action.classId);
      invalidateShowMapActionQueries(variables?.targetClassId);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async ({ entryIds }: { entryIds: string[]; classId?: string | undefined }) => {
      if (entryIds.length === 0) return [];
      const result = await bulkUpdateEntryStatus(entryIds, 'confirmed');
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: (_data, { entryIds }) => {
      const count = entryIds.length;
      toast.success(
        count === 1 ? 'Entry approved' : `${count} entries approved`
      );
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.classId);
    },
  });

  const approveEntryMutation = useMutation({
    mutationFn: async ({ action }: { action: ShowMapAction }) => {
      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');
      const result = await updateEntryStatus(entryId, 'confirmed');
      if (result.error) throw result.error;
      return result.data;
    },
    onSuccess: () => {
      toast.success('Entry approved');
      setReviewAction(null);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
    onSettled: (_data, _error, variables) => {
      invalidateShowMapActionQueries(variables?.action.classId);
    },
  });

  const messageHandlerMutation = useMutation({
    mutationFn: async ({ action, body }: { action: ShowMapAction; body: string }) => {
      const entryId = sourceIdFromShowMapNodeId(action.nodeId, 'entry');
      if (!entryId) throw new Error('Unable to find the entry for this action.');

      const target = await getShowMapHandlerMessageTarget(entryId);
      const thread = await getOrCreateThread(showId, target.participantAuthUserId);
      if (!thread) throw new Error('Unable to open the message thread.');

      await sendMessage(thread.id, showId, body);
      return target;
    },
    onSuccess: target => {
      toast.success(target.handlerName ? `Message sent to ${target.handlerName}` : 'Message sent');
      setMessageAction(null);
    },
    onError: error => {
      toast.error(getUserFriendlyError(error));
    },
  });

  const executeAction = useCallback(
    (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => {
      if (execution.kind === 'dialog' && execution.dialog === 'move-up-entry') {
        setMoveUpAction(action);
        return;
      }
      if (execution.kind === 'dialog' && execution.dialog === 'scratch-entry') {
        setScratchAction(action);
        return;
      }
      if (execution.kind === 'dialog' && execution.dialog === 'message-handler') {
        setMessageAction(action);
        return;
      }
      if (execution.kind === 'dialog' && execution.dialog === 'review-entry') {
        setReviewAction(action);
        return;
      }
      if (execution.kind === 'mutation') {
        mutation.mutate({ action, execution });
      }
    },
    [mutation]
  );

  return {
    executeAction,
    moveUpAction,
    closeMoveUpDialog: () => setMoveUpAction(null),
    confirmMoveUp: ({ targetClassId, reason }: ConfirmShowMapMoveUpInput) => {
      if (moveUpAction) moveUpMutation.mutate({ action: moveUpAction, targetClassId, reason });
    },
    lastMoveUp,
    undoLastMoveUp: () => {
      if (lastMoveUp) undoMoveUpMutation.mutate(lastMoveUp);
    },
    isUndoingMoveUp: undoMoveUpMutation.isPending,
    scratchAction,
    closeScratchDialog: () => setScratchAction(null),
    confirmScratchNoShow: (reason: string | undefined) => {
      if (scratchAction) scratchMutation.mutate({ action: scratchAction, reason });
    },
    messageAction,
    closeMessageDialog: () => setMessageAction(null),
    confirmMessageHandler: ({ body }: ConfirmShowMapMessageInput) => {
      if (messageAction) messageHandlerMutation.mutate({ action: messageAction, body });
    },
    reviewAction,
    closeReviewSheet: () => setReviewAction(null),
    confirmReviewApprove: () => {
      if (reviewAction) approveEntryMutation.mutate({ action: reviewAction });
    },
    isApprovingReview: approveEntryMutation.isPending,
    bulkApproveEntries: (entryIds: string[], classId?: string) => {
      if (entryIds.length === 0) return;
      bulkApproveMutation.mutate({ entryIds, classId });
    },
    isBulkApproving: bulkApproveMutation.isPending,
    isExecuting:
      mutation.isPending ||
      scratchMutation.isPending ||
      moveUpMutation.isPending ||
      messageHandlerMutation.isPending ||
      approveEntryMutation.isPending ||
      bulkApproveMutation.isPending,
  };
}
