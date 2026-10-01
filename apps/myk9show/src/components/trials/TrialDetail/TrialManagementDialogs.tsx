import { forwardRef, useImperativeHandle, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatTrialLabel } from '@myk9/core';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { DeleteObjectDialog, classDeleteDetail, trialDeleteDetail } from '@/features/delete';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { TrialWithClasses } from '@/hooks/useTrialDetailData';
import type { Show } from '@/types/show-types';

export interface TrialManagementDialogsHandle {
  openEditTrial: () => void;
  openDeleteTrial: () => void;
  openEditClass: (classItem: TrialClass) => void;
  openDeleteClass: (classItem: TrialClass) => void;
}

export interface TrialManagementDialogsProps {
  currentTrial: TrialWithClasses | undefined;
  parentShow: Show | undefined;
  /**
   * Called after the trial is deleted, in place of the default navigation. A host that is
   * not the deleted trial's own page (Setup's Trials list) stays where it is.
   */
  onTrialDeleted?: () => void;
  /**
   * Open the trial's edit panel or delete dialog on first render. A host that mounts this per
   * selection (Setup's row menu) passes the trial and the action together, so the form
   * initializes from the right trial instead of opening against a late-arriving one.
   */
  initialAction?: 'edit' | 'delete';
  /** Called when the trial edit panel or delete dialog closes (saved, cancelled or deleted). */
  onActionFinished?: () => void;
}

/**
 * All staff-only trial management dialogs (edit/delete trial,
 * edit/delete class) plus their open/confirm/save logic, extracted from
 * TrialDetailsPage. The page holds a ref and calls the exposed `open*` methods
 * from its hero/main actions, so the dialog state lives entirely here.
 */
export const TrialManagementDialogs = forwardRef<
  TrialManagementDialogsHandle,
  TrialManagementDialogsProps
>(function TrialManagementDialogs(
  { currentTrial, parentShow, onTrialDeleted, initialAction, onActionFinished },
  ref
) {
  const { showId } = useParams<{ showId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { trials, updateTrial } = useTrialStore();
  const { updateClass } = useClassStoreCompat();

  const showOrganization = parentShow?.organization;

  const [editTrialPanelOpen, setEditTrialPanelOpen] = useState(initialAction === 'edit');
  const [deleteTrialDialogOpen, setDeleteTrialDialogOpen] = useState(initialAction === 'delete');
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<TrialClass | null>(null);
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false);
  const [selectedClassForDelete, setSelectedClassForDelete] = useState<TrialClass | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      openEditTrial: () => setEditTrialPanelOpen(true),
      openDeleteTrial: () => setDeleteTrialDialogOpen(true),
      openEditClass: (classItem: TrialClass) => {
        setSelectedClassForEdit(classItem);
        setEditClassPanelOpen(true);
      },
      openDeleteClass: (classItem: TrialClass) => {
        setSelectedClassForDelete(classItem);
        setDeleteClassDialogOpen(true);
      },
    }),
    []
  );

  const closeEditTrial = () => {
    setEditTrialPanelOpen(false);
    onActionFinished?.();
  };
  const closeDeleteTrial = () => {
    setDeleteTrialDialogOpen(false);
    onActionFinished?.();
  };

  // The shared dialog has deleted the trial (soft, with Undo) and purged it locally.
  const handleTrialDeleted = () => {
    if (!currentTrial) return;
    if (onTrialDeleted) {
      onTrialDeleted();
    } else if (showId && currentTrial.showId) {
      navigate(`/shows/${currentTrial.showId}`);
    } else {
      const remainingTrials = trials.filter(t => t.id !== currentTrial.id);
      if (remainingTrials.length > 0) {
        navigate(`/trials/${remainingTrials[0].id}`, { replace: true });
      } else {
        navigate('/shows', { replace: true });
      }
    }
  };

  const trialLabel = formatTrialLabel({
    name: currentTrial?.name,
    trialNumber: currentTrial?.trialNumber,
  });

  return (
    <>
      <TrialEditPanel
        open={editTrialPanelOpen}
        onClose={closeEditTrial}
        trialId={currentTrial?.id || ''}
        trialName={currentTrial?.type || currentTrial?.trialNumber || ''}
        initialTrialData={currentTrial || {}}
        {...(showOrganization ? { organization: showOrganization } : {})}
        onSave={async trialData => {
          if (currentTrial?.id) {
            // Awaited: a failure rejects into EditPanelWrapper, which keeps the panel open with
            // the user's edits and shows the error. The panel closes itself (onClose) on success.
            await updateTrial(
              currentTrial.id,
              { ...currentTrial, ...trialData } as Partial<TrialInput>,
              user?.id || 'unknown'
            );
          }
        }}
      />

      {deleteTrialDialogOpen && currentTrial && (
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) closeDeleteTrial();
          }}
          kind="trial"
          targets={[
            {
              id: currentTrial.id,
              name: trialLabel,
              detail: trialDeleteDetail({
                name: currentTrial.name,
                trialNumber: currentTrial.trialNumber,
                date: currentTrial.trialDate,
              }),
              context: { showId: currentTrial.showId, trialId: currentTrial.id },
            },
          ]}
          onDeleted={handleTrialDeleted}
        />
      )}

      <ClassEditPanel
        open={editClassPanelOpen}
        onClose={() => setEditClassPanelOpen(false)}
        classId={selectedClassForEdit?.id || ''}
        className={selectedClassForEdit?.element || ''}
        initialClassData={selectedClassForEdit || {}}
        {...(parentShow?.id !== undefined && { showId: parentShow.id })}
        onSave={async classData => {
          if (selectedClassForEdit?.id) {
            // Save judge assignment FIRST (with replication sync) before updateClass,
            // so React Query's onSuccess refetch reads fresh judge data from replication cache
            const judgeId = (classData as Record<string, unknown>).judgeId as string | undefined;
            if (judgeId !== undefined && parentShow?.id) {
              try {
                await upsertClassJudgeAssignment(parentShow.id, selectedClassForEdit.id, judgeId);
                // Refresh replication cache so updateClass's onSuccess invalidation refetches fresh judge data
                await replicatedClassesTable.sync('');
              } catch {
                // Non-blocking — continue to class update
              }
            }

            // Now update class — its onSuccess invalidation will refetch fresh judge data
            await updateClass(selectedClassForEdit.id, { ...selectedClassForEdit, ...classData });

            useTrialStore.getState().loadTrialClasses();
            // Invalidate specific query keys for classes (safety net after fresh refetch)
            queryClient.invalidateQueries({ queryKey: classKeys.lists() });
            if (currentTrial?.id) {
              queryClient.invalidateQueries({ queryKey: classKeys.byTrial(currentTrial.id) });
            }
            queryClient.invalidateQueries({ queryKey: classKeys.detail(selectedClassForEdit.id) });

            setEditClassPanelOpen(false);
            setSelectedClassForEdit(null);
          }
        }}
      />

      {deleteClassDialogOpen && selectedClassForDelete && currentTrial && (
        // The same delete and purge as Setup and Class Details (features/delete).
        <DeleteObjectDialog
          open
          onOpenChange={open => {
            if (!open) {
              setDeleteClassDialogOpen(false);
              setSelectedClassForDelete(null);
            }
          }}
          kind="class"
          targets={[
            {
              id: selectedClassForDelete.id,
              name: [
                selectedClassForDelete.element,
                selectedClassForDelete.level,
                selectedClassForDelete.section,
              ]
                .filter(Boolean)
                .join(' '),
              detail: classDeleteDetail({
                level: selectedClassForDelete.level,
                element: selectedClassForDelete.element,
                trialLabel,
              }),
              context: { showId: currentTrial.showId, trialId: currentTrial.id },
            },
          ]}
        />
      )}
    </>
  );
});
