import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { selectQualifiedJudges } from '@/features/judges/qualifiedJudges';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { UNASSIGNED_JUDGE_VALUE } from './ClassJudgeSelect';

/** What a judge assignment needs to know about a class; Setup's `ClassInfo` and the cockpit's class both fit. */
export interface JudgeAssignableClass {
  id: string;
  trialId: string;
  /** The assigned judge's person id; '', 'TBD' and a missing id all read as none. */
  judgeId?: string | null | undefined;
}

/** The judge list's read state: an empty list only means "no judges" once it is `ready`. */
export type JudgeListStatus = 'loading' | 'error' | 'ready';

/** The picker's stored value for "no judge": '', 'TBD' and a missing id all read as none. */
export function normalizeJudgeId(judgeId: string | null | undefined): string | null {
  return !judgeId || judgeId === UNASSIGNED_JUDGE_VALUE ? null : judgeId;
}

/** A judge just assigned here, and the judge the class had when it was assigned. */
interface JudgeOverride {
  judgeId: string | null;
  from: string | null;
}

/**
 * Per-class judge assignment, shared by Setup → Classes' table and the show home's class panel
 * (MYK9-1323). The write is the replicated `upsertClassJudgeAssignment`, so it queues offline.
 * Everything stays inert for non-managers: the show and judge queries are not read.
 */
export function useClassJudgeAssignment(
  showId: string,
  canManage: boolean,
  /** Every class of the show, unfiltered: what judge-override expiry must see. */
  allClasses: readonly JudgeAssignableClass[]
) {
  const queryClient = useQueryClient();
  const showQuery = useShowQuery(canManage ? showId : '');
  const show = showQuery.data;
  const judgesQuery = useJudgesWithQualifications(canManage);
  // Scoped to the show's organization: assigning a judge here is what puts them on the show and
  // its registry paperwork, so an AKC show must not offer UKC- or ASCA-only judges.
  const availableJudges = useMemo(
    () => selectQualifiedJudges(judgesQuery.data, show?.organization),
    [judgesQuery.data, show?.organization]
  );
  // Offline, React Query pauses the judge read instead of failing it; that is "unavailable" too,
  // not a load still on its way.
  const judgesUnavailable =
    judgesQuery.isError || (judgesQuery.fetchStatus === 'paused' && judgesQuery.data === undefined);
  const judgeListStatus: JudgeListStatus =
    judgesUnavailable || showQuery.isError
      ? 'error'
      : judgesQuery.data === undefined || !show
        ? 'loading'
        : 'ready';

  // The store row only learns the new judge when replication next syncs, so the picker shows
  // what was just assigned instead of snapping back to the old judge. The override holds only
  // while the row still carries the judge it had at assignment: once the row catches up, or
  // another secretary changes it, the row wins and their change shows.
  const [assigned, setAssigned] = useState<Record<string, JudgeOverride>>({});
  const assignJudge = useMutation({
    mutationFn: async ({ cls, judgeId }: { cls: JudgeAssignableClass; judgeId: string }) => {
      await upsertClassJudgeAssignment(showId, cls.id, judgeId);
      return cls;
    },
    onSuccess: (cls, { judgeId }) => {
      setAssigned(previous => ({
        ...previous,
        [cls.id]: { judgeId: normalizeJudgeId(judgeId), from: normalizeJudgeId(cls.judgeId) },
      }));
      queryClient.invalidateQueries({ queryKey: classKeys.byTrial(cls.trialId) });
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
    },
    onError: () => {
      toast.error('Failed to assign judge. Please try again.');
    },
  });

  // An override is spent the moment its row stops carrying `from` (the row caught up, or
  // someone else changed it). Dropping it then, not just ignoring it, is what stops it reviving
  // when the judge later goes A -> B -> A and the row reads `from` again. It checks every class,
  // not just the visible ones: a class hidden while replication catches up must not keep it.
  const spentIds = allClasses
    .filter(cls => {
      const override = assigned[cls.id];
      return override !== undefined && override.from !== normalizeJudgeId(cls.judgeId);
    })
    .map(cls => cls.id);
  if (spentIds.length > 0) {
    setAssigned(previous => {
      const next = { ...previous };
      for (const id of spentIds) delete next[id];
      return next;
    });
  }

  const judgeIdFor = useCallback(
    (cls: JudgeAssignableClass): string | null => {
      const rowJudgeId = normalizeJudgeId(cls.judgeId);
      const override = assigned[cls.id];
      return override && override.from === rowJudgeId ? override.judgeId : rowJudgeId;
    },
    [assigned]
  );

  return {
    availableJudges,
    judgeListStatus,
    judgeIdFor,
    assignJudge: (cls: JudgeAssignableClass, judgeId: string) =>
      assignJudge.mutate({ cls, judgeId }),
  };
}
