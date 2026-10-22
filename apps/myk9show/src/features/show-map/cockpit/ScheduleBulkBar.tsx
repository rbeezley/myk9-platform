import { useMemo } from 'react';

import { ClassBulkActionsBar, type ClassBarItem } from '@/components/classes/ClassBulkActionsBar';
import { UNASSIGNED_JUDGE_VALUE } from '@/components/classes/ClassJudgeSelect';
import { useClassBulkActions } from '@/components/classes/useClassBulkActions';
import type { JudgeListStatus } from '@/components/classes/useClassJudgeAssignment';
import {
  useBulkJudgeAssignment,
  type BulkJudgeClass,
} from '@/components/classes/useBulkJudgeAssignment';
import type { AssignedJudgeName } from '@/services/database/judges';
import { BulkBarActions } from '@/components/list-toolkit';
import type { RowAction } from '@/components/ui/RowActionMenu';

import { judgeLockReason } from './focusedClassJudge';
import type { ScheduleClassSelection } from './useScheduleClassSelection';
import type {
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  ScheduledClassModel,
} from './secretaryCockpitTypes';

/**
 * Select classes' bulk bar on the show home's schedule (MYK9-1324): the Setup table's bar
 * (Change status, Delete, Export) plus Assign judge, over the classes ticked in one trial.
 */
export function ScheduleBulkBar({
  showId,
  model,
  classes,
  selection,
  availableJudges,
  judgeListStatus,
  judgeNamesFor,
}: {
  showId: string;
  model: SecretaryCockpitModel;
  classes: readonly SecretaryCockpitClass[];
  selection: ScheduleClassSelection;
  availableJudges: ReadonlyArray<{ id: string; name: string }>;
  judgeListStatus: JudgeListStatus;
  judgeNamesFor: (judgeId: string) => AssignedJudgeName | undefined;
}) {
  const classesById = useMemo(
    () =>
      new Map(
        classes.map(cls => [cls.id, { id: cls.id, name: cls.name, status: cls.status ?? null }])
      ),
    [classes]
  );
  const { bulkBusy, handleBulkStatusChange } = useClassBulkActions({ classesById });
  const judge = useBulkJudgeAssignment(showId, judgeNamesFor);

  const group = model.trialGroups.find(item => item.trialId === selection.selection.trialId);
  const scheduledById = new Map<string, ScheduledClassModel>(
    (group?.classes ?? []).map(cls => [cls.id, cls])
  );
  const sourceById = new Map(classes.map(cls => [cls.id, cls]));
  const picked = selection.selection.classIds.flatMap(id => {
    const source = sourceById.get(id);
    const scheduled = scheduledById.get(id);
    return source && scheduled ? [{ source, scheduled }] : [];
  });

  const barItems: ClassBarItem[] = picked.map(({ source }) => ({
    id: source.id,
    name: source.name,
    status: source.status ?? null,
    trialId: source.trialId,
    trialLabel: group?.label,
    element: source.element ?? null,
    level: source.level ?? null,
    section: source.section ?? null,
    judgeName: source.judgeName ?? null,
    entryCount: source.entryCount ?? null,
    time: source.scheduledStart ?? null,
  }));
  const judgeTargets: BulkJudgeClass[] = picked.map(({ source, scheduled }) => ({
    id: source.id,
    trialId: source.trialId,
    name: source.name,
    locked:
      judgeLockReason({
        lifecycle: scheduled.lifecycle,
        progress: scheduled.progress,
        actualStart: { evidence: 'recorded', value: source.actualStart ?? null },
      }) !== null,
  }));
  const openCount = judgeTargets.filter(cls => !cls.locked).length;
  const busy = bulkBusy || judge.busy;

  const assign = (judgeId: string) => void judge.assign(judgeTargets, judgeId);
  const judgeActions: RowAction[] = [
    {
      id: 'judge:status',
      label: judgeListStatus === 'loading' ? 'Loading judges…' : "Judges can't load right now",
      disabled: true,
      onSelect: () => undefined,
      hidden: judgeListStatus === 'ready',
    },
    ...availableJudges.map(item => ({
      id: `judge:${item.id}`,
      label: item.name,
      onSelect: () => assign(item.id),
    })),
    {
      id: 'judge:unassigned',
      label: 'Unassigned',
      separatorBefore: availableJudges.length > 0,
      onSelect: () => assign(UNASSIGNED_JUDGE_VALUE),
    },
  ];
  const judgeLabel =
    openCount === judgeTargets.length
      ? 'Assign judge'
      : `Assign judge (${openCount} of ${judgeTargets.length})`;

  return (
    <ClassBulkActionsBar
      selectedClasses={barItems}
      bulkBusy={busy}
      context={{ showId }}
      trialLabel={group?.label}
      onBulkStatusChange={handleBulkStatusChange}
      onClear={selection.clear}
      extraActions={
        <BulkBarActions
          actions={judgeActions}
          menuLabel={judgeLabel}
          disabled={busy || openCount === 0}
        />
      }
    />
  );
}
