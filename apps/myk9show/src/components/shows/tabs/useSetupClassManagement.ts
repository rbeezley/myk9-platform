import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import {
  applyManualClassStatus,
  type ManualClassStatus,
} from '@/services/show-day/classStatusMutations';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import { useClassJudgeAssignment } from '@/components/classes/useClassJudgeAssignment';
import type { ClassInfo } from './classInfo';

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
  // Judge assignment is shared with the show home's class panel (MYK9-1323).
  const { availableJudges, judgeIdFor, assignJudge } = useClassJudgeAssignment(
    showId,
    canManage,
    allClasses
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
  const { bulkBusy, handleBulkStatusChange } = useClassBulkActions({
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

  return {
    selection,
    bulkBusy,
    handleBulkStatusChange,
    handleStatusChange,
    availableJudges,
    judgeIdFor,
    assignJudge: (cls: ClassInfo, judgeId: string) => assignJudge(cls, judgeId),
  };
}
