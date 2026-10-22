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
  /** The picked judge's name, kept in case the judge list later drops them. */
  judgeName: string | null;
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
  allClasses: readonly JudgeAssignableClass[],
  /**
   * The judge list's refetch on window focus. The show home passes `true` (only when stale):
   * a tablet at a show switches apps constantly, and 'always' re-reads the whole directory
   * each time.
   */
  refetchJudgesOnFocus: boolean | 'always' = 'always'
) {
  const queryClient = useQueryClient();
  const showQuery = useShowQuery(canManage ? showId : '');
  const show = showQuery.data;
  const judgesQuery = useJudgesWithQualifications(canManage, refetchJudgesOnFocus);
  // Scoped to the show's organization: assigning a judge here is what puts them on the show and
  // its registry paperwork, so an AKC show must not offer UKC- or ASCA-only judges.
  const availableJudges = useMemo(
    () => selectQualifiedJudges(judgesQuery.data, show?.organization),
    [judgesQuery.data, show?.organization]
  );
  // Offline, React Query pauses a read instead of failing it; that is "unavailable" too, not a
  // load still on its way. The list needs both reads: the judges, and the show's registry.
  // A failed background refetch keeps the cached list usable: only a read with nothing to show
  // is unavailable.
  const judgesUnavailable =
    judgesQuery.data === undefined && (judgesQuery.isError || judgesQuery.fetchStatus === 'paused');
  const showUnavailable = !show && (showQuery.isError || showQuery.fetchStatus === 'paused');
  const judgeListStatus: JudgeListStatus =
    judgesUnavailable || showUnavailable
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
    // The write is a local replicated write that syncs itself, so it must run offline too; the
    // app's default 'online' mode would park it until reconnect and drop it on a reload.
    networkMode: 'always',
    mutationFn: async ({ cls, judgeId }: { cls: JudgeAssignableClass; judgeId: string }) => {
      await upsertClassJudgeAssignment(showId, cls.id, judgeId);
      return cls;
    },
    onSuccess: (cls, { judgeId }) => {
      const picked = normalizeJudgeId(judgeId);
      setAssigned(previous => {
        // A second change before replication catches up keeps the ROW's judge as `from`: a
        // caller may pass the class with the first override already applied, and recording that
        // as `from` would read as "the row moved on" and drop the override (A -> B -> C showed A).
        const live = previous[cls.id];
        return {
          ...previous,
          [cls.id]: {
            judgeId: picked,
            from: live ? live.from : normalizeJudgeId(cls.judgeId),
            judgeName: availableJudges.find(judge => judge.id === picked)?.name ?? null,
          },
        };
      });
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

  // A name for an assigned judge id: the list's, or the one remembered when it was picked.
  const judgeNameFor = useCallback(
    (judgeId: string): string | null =>
      availableJudges.find(judge => judge.id === judgeId)?.name ??
      Object.values(assigned).find(override => override.judgeId === judgeId)?.judgeName ??
      null,
    [availableJudges, assigned]
  );

  return {
    availableJudges,
    judgeListStatus,
    judgeIdFor,
    judgeNameFor,
    assignJudge: (cls: JudgeAssignableClass, judgeId: string) =>
      assignJudge.mutate({ cls, judgeId }),
  };
}
