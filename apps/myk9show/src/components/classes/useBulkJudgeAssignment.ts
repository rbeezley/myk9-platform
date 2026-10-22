import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { upsertClassJudgeAssignment, type AssignedJudgeName } from '@/services/database/judges';

/** A selected class, as bulk Assign judge reads it. */
export interface BulkJudgeClass {
  id: string;
  trialId: string;
  name: string;
  /** Started, cancelled or unreadable: the class keeps its judge (MYK9-1323's lock rule). */
  locked: boolean;
}

function startedNote(count: number): string {
  return count === 1
    ? '1 started class kept its judge.'
    : `${count} started classes kept their judges.`;
}

/**
 * Bulk Assign judge on the show home's schedule (MYK9-1324): the same replicated write as the
 * class panel's picker, once per class that has not started, through `useBulkDispatch` like bulk
 * status (settled fold, in-flight latch, summary toast, Retry failed). A locked class is never
 * written; the toast says how many were left alone.
 */
export function useBulkJudgeAssignment(
  showId: string,
  judgeNamesFor: (judgeId: string) => AssignedJudgeName | undefined,
  /**
   * Whether the class is locked NOW, from the freshest data. "Retry failed" runs after later
   * renders, and a class that started in between must keep its judge, the lock rule's whole point.
   */
  isLockedNow: (classId: string) => boolean
) {
  const queryClient = useQueryClient();
  const getLabel = useCallback((cls: BulkJudgeClass) => cls.name || 'Untitled Class', []);
  const dispatch = useBulkDispatch<BulkJudgeClass>({ getLabel });

  const assign = useCallback(
    async (classes: readonly BulkJudgeClass[], judgeId: string): Promise<boolean> => {
      const eligible = classes.filter(cls => !cls.locked);
      const lockedCount = classes.length - eligible.length;
      if (eligible.length === 0) {
        if (lockedCount > 0) toast.info(startedNote(lockedCount));
        return false;
      }
      const names = judgeNamesFor(judgeId);
      const outcome = await dispatch.run(
        eligible,
        async cls => {
          await upsertClassJudgeAssignment(showId, cls.id, judgeId, names);
          await queryClient.invalidateQueries({ queryKey: classKeys.byTrial(cls.trialId) });
        },
        { applicableWhen: cls => !isLockedNow(cls.id) }
      );
      if (outcome === null) return false;
      void queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
      if (lockedCount > 0) toast.info(startedNote(lockedCount));
      return outcome.failed.length === 0;
    },
    [dispatch, isLockedNow, judgeNamesFor, queryClient, showId]
  );

  return { assign, busy: dispatch.isBusy };
}
