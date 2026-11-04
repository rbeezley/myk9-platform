import { useMemo } from 'react';
import { ArrowUpCircle } from 'lucide-react';

import type { RowAction } from '@/components/ui/RowActionMenu';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import {
  buildMoveUpClassLabeler,
  classIdsEnteredByDog,
} from '@/features/show-map/buildMoveUpTargets';
import { getChangeClassBlock } from '@/features/show-map/changeClassEligibility';
import { ShowMapMoveUpDialog } from '@/features/show-map/ShowMapMoveUpDialog';
import type { ShowMapAction } from '@/features/show-map/showMapActions';
import { classifyClassStatus, classifyEntryRunStatus } from '@/features/show-map/showMapStatus';
import type { ShowMapEntryInput, ShowMapNode } from '@/features/show-map/showMapTypes';
import { useChangeClassClasses } from '@/features/show-map/useChangeClassClasses';
import { useMoveUpTargets } from '@/features/show-map/useMoveUpTargets';
import { useShowMapActionExecutor } from '@/features/show-map/useShowMapActionExecutor';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const OFFLINE_REASON = 'Changing a class needs a connection.';

/** The entry as the Show Map status helpers read it, so both doors classify "has it run?" alike. */
function toRunStatusInput(entry: EntryManagementEntry): ShowMapEntryInput {
  const cls = entry.classes[0];
  return {
    entry_status: entry.rawEntryStatus,
    is_scored: entry.isScored,
    result_status: entry.resultStatus,
    check_in_status: cls?.checkInStatus,
  };
}

function toAction(entry: EntryManagementEntry, classId: string): ShowMapAction {
  return {
    id: 'move-up-entry',
    nodeId: `entry:${entry.id}`,
    label: 'Change class',
    why: `Change ${entry.dogName} to another class`,
    priority: 32,
    icon: ArrowUpCircle,
    classId,
  };
}

function toNode(entry: EntryManagementEntry): ShowMapNode {
  return {
    id: `entry:${entry.id}`,
    type: 'entry',
    label: entry.dogName,
    childrenCount: 0,
    entryDisplay: {
      dogName: entry.dogName,
      dogId: entry.dogId,
      entryStatus: entry.rawEntryStatus ?? undefined,
      ...(entry.armbandNumber && { armband: entry.armbandNumber }),
    },
  };
}

/**
 * The entry form's door to "Change class" (MYK9-1614). It owns no change-class logic: the
 * dialog, the targets, the rule (`getChangeClassBlock`) and the submit
 * (`useShowMapActionExecutor` → `moveUpShowMapEntry`) are the Overview's, so the two doors
 * are one action. Money-neutral exactly as there: nothing here touches a fee.
 */
export function useEntryChangeClass(showId: string, entries: readonly EntryManagementEntry[]) {
  const isOnline = useIsOnline();
  const classes = useChangeClassClasses(showId);
  const executor = useShowMapActionExecutor({ showId });
  const { moveUpAction } = executor;

  const openEntry = moveUpAction
    ? entries.find(entry => `entry:${entry.id}` === moveUpAction.nodeId)
    : undefined;
  // Read only while the dialog is open: the dog's other entries decide which classes are taken.
  const { data: showEntries } = useSecretaryShowEntriesQuery(showId, Boolean(moveUpAction));
  const enteredClassIds = useMemo(
    () =>
      classIdsEnteredByDog((showEntries ?? []) as unknown as ShowMapEntryInput[], openEntry?.dogId),
    [showEntries, openEntry?.dogId]
  );
  const { targets, capacityState, capacityIsStale } = useMoveUpTargets(
    showId,
    classes ?? [],
    moveUpAction?.classId,
    enteredClassIds
  );
  const currentClass = useMemo(() => {
    const cls = classes?.find(candidate => candidate.id === moveUpAction?.classId);
    if (!cls || !classes) return undefined;
    return {
      id: `class:${cls.id}`,
      type: 'class' as const,
      label: buildMoveUpClassLabeler(classes)(cls),
      childrenCount: 0,
    };
  }, [classes, moveUpAction?.classId]);

  /** The row-menu item for one entry; hidden when the entry has no class to change. */
  const actionFor = (entry: EntryManagementEntry): RowAction => {
    const classId = entry.classes[0]?.classId;
    if (!classId)
      return { id: 'change-class', label: 'Change class…', onSelect: () => {}, hidden: true };
    const cls = classes?.find(candidate => candidate.id === classId);
    const block = !cls
      ? 'Checking the class…'
      : getChangeClassBlock({
          entryStatus: entry.rawEntryStatus,
          runStatusKind: classifyEntryRunStatus(toRunStatusInput(entry))?.kind,
          classStatusKind: classifyClassStatus(cls.status)?.kind,
        });
    const reason = block ?? (isOnline ? null : OFFLINE_REASON);
    return {
      id: 'change-class',
      label: 'Change class…',
      icon: <ArrowUpCircle />,
      disabled: reason !== null,
      ...(reason !== null && { description: reason }),
      onSelect: () =>
        executor.executeAction(toAction(entry, classId), {
          kind: 'dialog',
          dialog: 'move-up-entry',
        }),
    };
  };

  const dialog = (
    <ShowMapMoveUpDialog
      open={Boolean(moveUpAction)}
      node={openEntry ? toNode(openEntry) : undefined}
      currentClass={currentClass}
      targets={targets}
      capacityState={capacityState}
      capacityIsStale={capacityIsStale}
      isSubmitting={executor.isExecuting}
      onOpenChange={open => !open && executor.closeMoveUpDialog()}
      onConfirm={executor.confirmMoveUp}
      {...(executor.moveUpReversal !== undefined && { reversal: executor.moveUpReversal })}
      isReversing={executor.isReversingMoveUp}
      onMoveBack={executor.reverseMoveUp}
    />
  );

  return { actionFor, dialog };
}
