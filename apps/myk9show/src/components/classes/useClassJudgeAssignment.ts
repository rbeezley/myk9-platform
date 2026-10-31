import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import {
  useJudgesWithQualifications,
  type JudgeListRefresh,
} from '@/hooks/queries/useJudgesWithQualifications';
import { selectQualifiedJudges } from '@/features/judges/qualifiedJudges';
import { upsertClassJudgeAssignment, type AssignedJudgeName } from '@/services/database/judges';
import { UNASSIGNED_JUDGE_VALUE } from './ClassJudgeSelect';

/** What a judge assignment needs to know about a class; Setup's `ClassInfo` and the cockpit's class both fit. */
export interface JudgeAssignableClass {
  id: string;
  trialId: string;
}

/** The judge list's read state: an empty list only means "no judges" once it is `ready`. */
export type JudgeListStatus = 'loading' | 'error' | 'ready';

/** The picker's stored value for "no judge": '', 'TBD' and a missing id all read as none. */
export function normalizeJudgeId(judgeId: string | null | undefined): string | null {
  return !judgeId || judgeId === UNASSIGNED_JUDGE_VALUE ? null : judgeId;
}

/**
 * Per-class judge assignment for the show home's class panel (MYK9-1323). Select classes' bulk
 * Assign judge (MYK9-1324) reads this hook's judge list and names but writes through
 * `useBulkJudgeAssignment`. The write is the replicated `upsertClassJudgeAssignment`, which also puts the
 * picked judge on the local class row (MYK9-1327), so every screen shows it at once, offline
 * and after a reload, with no override held here. Everything stays inert for non-managers:
 * the show and judge queries are not read.
 */
export function useClassJudgeAssignment(
  showId: string,
  canManage: boolean,
  /** The show home passes 'when-stale': see `JudgeListRefresh`. */
  judgeListRefresh: JudgeListRefresh = 'always'
) {
  const queryClient = useQueryClient();
  const showQuery = useShowQuery(canManage ? showId : '');
  const show = showQuery.data;
  const judgesQuery = useJudgesWithQualifications(canManage, judgeListRefresh);
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

  // The picked judge's name goes onto the class row with the id, so the row never reads
  // "Judge not set" or the previous judge's name while it waits for the server.
  const judgeNamesFor = (judgeId: string): AssignedJudgeName | undefined => {
    const picked = normalizeJudgeId(judgeId);
    const person = picked ? judgesQuery.data?.find(judge => judge.id === picked) : undefined;
    const name = picked ? availableJudges.find(judge => judge.id === picked)?.name : undefined;
    return name ? { name, firstName: person?.firstName, lastName: person?.lastName } : undefined;
  };

  const assignJudge = useMutation({
    // The write is a local replicated write that syncs itself, so it must run offline too; the
    // app's default 'online' mode would park it until reconnect and drop it on a reload.
    networkMode: 'always',
    mutationFn: async ({ cls, judgeId }: { cls: JudgeAssignableClass; judgeId: string }) => {
      await upsertClassJudgeAssignment(showId, cls.id, judgeId, judgeNamesFor(judgeId));
      return cls;
    },
    onSuccess: cls => {
      queryClient.invalidateQueries({ queryKey: classKeys.byTrial(cls.trialId) });
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
    },
    onError: () => {
      toast.error('Failed to assign judge. Please try again.');
    },
  });

  return {
    availableJudges,
    /** The show's organization, so the panel can say which registry a judge is not qualified for. */
    showOrganization: show?.organization,
    judgeListStatus,
    judgeNamesFor,
    assignJudge: (cls: JudgeAssignableClass, judgeId: string) =>
      assignJudge.mutate({ cls, judgeId }),
  };
}
