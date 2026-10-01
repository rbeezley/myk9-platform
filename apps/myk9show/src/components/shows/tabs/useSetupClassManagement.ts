import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useShowQuery } from '@/hooks/queries/useShowsDatabase';
import { useJudgesWithQualifications } from '@/hooks/queries/useJudgesWithQualifications';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { selectQualifiedJudges } from '@/features/judges/qualifiedJudges';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import { UNASSIGNED_JUDGE_VALUE } from '@/components/classes/ClassJudgeSelect';
import type { ClassInfo } from './ClassesTab';

/**
 * Setup → Classes' manager layer: bulk status (the Class Management bulk bar's hook) and
 * per-class judge assignment (the same replicated write the retired page used).
 * Everything stays inert for non-managers: the show and judge queries are not read.
 */
export function useSetupClassManagement(
  showId: string,
  canManage: boolean,
  visibleClasses: ClassInfo[],
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

  const classesById = useMemo(
    () =>
      new Map(
        visibleClasses.map(cls => [cls.id, { id: cls.id, name: cls.name, status: cls.status }])
      ),
    [visibleClasses]
  );
  const { bulkBusy, handleBulkDelete, handleBulkStatusChange } = useClassBulkActions({
    classesById,
  });

  // The store row only learns the new judge when replication next syncs, so the picker shows
  // what was just assigned instead of snapping back to the old judge.
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const assignJudge = useMutation({
    mutationFn: async ({ cls, judgeId }: { cls: ClassInfo; judgeId: string }) => {
      await upsertClassJudgeAssignment(showId, cls.id, judgeId);
      return cls;
    },
    onSuccess: (cls, { judgeId }) => {
      setAssigned(previous => ({ ...previous, [cls.id]: judgeId }));
      queryClient.invalidateQueries({ queryKey: classKeys.byTrial(cls.trialId) });
      queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
    },
    onError: () => {
      toast.error('Failed to assign judge. Please try again.');
    },
  });

  const judgeIdFor = useCallback(
    (cls: ClassInfo): string | null => {
      const judgeId = assigned[cls.id] ?? cls.judgeId ?? null;
      return judgeId === UNASSIGNED_JUDGE_VALUE || judgeId === '' ? null : judgeId;
    },
    [assigned]
  );

  return {
    selection,
    bulkBusy,
    handleBulkDelete,
    handleBulkStatusChange,
    availableJudges,
    judgeIdFor,
    assignJudge: (cls: ClassInfo, judgeId: string) => assignJudge.mutate({ cls, judgeId }),
  };
}
