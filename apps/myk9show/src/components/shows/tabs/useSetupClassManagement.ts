import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { selectQualifiedJudges } from '@/features/judges/qualifiedJudges';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import {
  applyManualClassStatus,
  type ManualClassStatus,
} from '@/services/show-day/classStatusMutations';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import { UNASSIGNED_JUDGE_VALUE } from '@/components/classes/ClassJudgeSelect';
import type { ClassInfo } from './classInfo';

/** The picker's stored value for "no judge": '', 'TBD' and a missing id all read as none. */
function normalizeJudgeId(judgeId: string | null | undefined): string | null {
  return !judgeId || judgeId === UNASSIGNED_JUDGE_VALUE ? null : judgeId;
}

/** A judge just assigned from this tab, and the judge the class had when it was assigned. */
interface JudgeOverride {
  judgeId: string | null;
  from: string | null;
}

/**
 * Setup → Classes' manager layer: bulk and single-class status (the retired Class Management
 * page's own mutations) and per-class judge assignment (the same replicated write).
 * Everything stays inert for non-managers: the show and judge queries are not read.
 */
export function useSetupClassManagement(
  showId: string,
  canManage: boolean,
  visibleClasses: ClassInfo[],
  /** Every class of the show, unfiltered: what retries and judge-override expiry must see. */
  allClasses: ClassInfo[],
  viewKey: string
) {
  const queryClient = useQueryClient();
  const { data: show } = useShowQuery(canManage ? showId : '');
  const { data: judges } = useJudgesWithQualifications(canManage);
  // Scoped to the show's organization: assigning a judge here is what puts them on the show and
  // its registry paperwork, so an AKC show must not offer UKC- or ASCA-only judges.
  const availableJudges = useMemo(
    () => selectQualifiedJudges(judges, show?.organization),
    [judges, show?.organization]
  );

  const getClassId = useCallback((cls: ClassInfo) => cls.id, []);
  const selection = useBulkSelection<ClassInfo>({
    items: visibleClasses,
    getItemId: getClassId,
    pruneToItems: true,
    // Changing the view clears the selection, so a bulk action never reaches rows the
    // secretary can no longer see.
    resetKey: viewKey,
  });

  // Selection stays on the visible rows, but a toast-driven "Retry failed" fires after the view,
  // search or trial may have moved on, and re-checks each class against THIS map: built from the
  // visible rows only, it would skip every class the secretary has since hidden.
  const classesById = useMemo(
    () =>
      new Map(allClasses.map(cls => [cls.id, { id: cls.id, name: cls.name, status: cls.status }])),
    [allClasses]
  );
  const { bulkBusy, handleBulkDelete, handleBulkStatusChange } = useClassBulkActions({
    classesById,
  });

  // Single-class status, from the row menu: the replicated mutation the bulk path and Show Map
  // use (`status_source: 'manual'`, per-status timing, queued offline). It does not run the old
  // row mutation's invalidation, so refresh the whole class family here.
  const handleStatusChange = async (classId: string, status: string) => {
    try {
      await applyManualClassStatus(classId, status as ManualClassStatus);
      queryClient.invalidateQueries({ queryKey: classKeys.all });
    } catch {
      toast.error('Failed to update class status. Please try again.');
    }
  };

  // The store row only learns the new judge when replication next syncs, so the picker shows
  // what was just assigned instead of snapping back to the old judge. The override holds only
  // while the row still carries the judge it had at assignment: once the row catches up, or
  // another secretary changes it, the row wins and their change shows.
  const [assigned, setAssigned] = useState<Record<string, JudgeOverride>>({});
  const assignJudge = useMutation({
    mutationFn: async ({ cls, judgeId }: { cls: ClassInfo; judgeId: string }) => {
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
    (cls: ClassInfo): string | null => {
      const rowJudgeId = normalizeJudgeId(cls.judgeId);
      const override = assigned[cls.id];
      return override && override.from === rowJudgeId ? override.judgeId : rowJudgeId;
    },
    [assigned]
  );

  return {
    selection,
    bulkBusy,
    handleBulkDelete,
    handleBulkStatusChange,
    handleStatusChange,
    availableJudges,
    judgeIdFor,
    assignJudge: (cls: ClassInfo, judgeId: string) => assignJudge.mutate({ cls, judgeId }),
  };
}
