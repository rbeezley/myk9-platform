import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTemplateStore } from '@/store/templateStore';
import { useTrialTemplates } from '@/hooks/useTrialTemplates';
import { AddClassesToTrialPanel } from '@/components/classes/AddClassesToTrialPanel';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import StandardDialog from '@/components/common/StandardDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import type { TrialClass } from '@/components/trials/types/trial.types';
import type { TrialWithClasses } from '@/hooks/useTrialDetailData';
import type { Show } from '@/types/show-types';

export interface TrialManagementDialogsHandle {
  openEditTrial: () => void;
  openDeleteTrial: () => void;
  openAddClasses: () => void;
  openEditClass: (classItem: TrialClass) => void;
  openDeleteClass: (classItem: TrialClass) => void;
}

export interface TrialManagementDialogsProps {
  currentTrial: TrialWithClasses | undefined;
  parentShow: Show | undefined;
  /** The trial's classes (already converted by the page) for the Add-Classes panel. */
  existingClasses: React.ComponentProps<typeof AddClassesToTrialPanel>['existingClasses'];
  /** Per-class entry counts, for the delete-class confirmation copy. */
  entryCountByClass: Map<string, number>;
}

/**
 * All staff-only trial management dialogs (add classes, edit/delete trial,
 * edit/delete class) plus their open/confirm/save logic, extracted from
 * TrialDetailsPage. The page holds a ref and calls the exposed `open*` methods
 * from its hero/main actions, so the dialog state lives entirely here.
 */
export const TrialManagementDialogs = forwardRef<
  TrialManagementDialogsHandle,
  TrialManagementDialogsProps
>(function TrialManagementDialogs(
  { currentTrial, parentShow, existingClasses, entryCountByClass },
  ref
) {
  const { showId } = useParams<{ showId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { trials, updateTrial, deleteTrial: deleteTrialAsync } = useTrialStore();
  const { addClass, updateClass, deleteClass } = useClassStoreCompat();
  const { templates, loadTemplatesFromDB } = useTemplateStore();

  const showOrganization = parentShow?.organization;

  const [editTrialPanelOpen, setEditTrialPanelOpen] = useState(false);
  const [deleteTrialDialogOpen, setDeleteTrialDialogOpen] = useState(false);
  const [addClassesFromTemplateDialogOpen, setAddClassesFromTemplateDialogOpen] = useState(false);
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<TrialClass | null>(null);
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false);
  const [selectedClassForDelete, setSelectedClassForDelete] = useState<TrialClass | null>(null);

  // Templates power the "Add Classes" panel; load them once on mount so the
  // panel never opens to an empty list. Initializer is idempotent.
  useEffect(() => {
    loadTemplatesFromDB();
  }, [loadTemplatesFromDB]);

  const { handleSaveClassesFromTemplate } = useTrialTemplates({
    currentTrial,
    updateTrial,
    addClass,
    userId: user?.id || 'unknown',
  });

  useImperativeHandle(
    ref,
    () => ({
      openEditTrial: () => setEditTrialPanelOpen(true),
      openDeleteTrial: () => setDeleteTrialDialogOpen(true),
      openAddClasses: () => setAddClassesFromTemplateDialogOpen(true),
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

  const handleConfirmDeleteTrial = async () => {
    if (currentTrial) {
      await deleteTrialAsync(currentTrial.id);
      if (showId && currentTrial.showId) {
        navigate(`/shows/${currentTrial.showId}`);
      } else {
        const remainingTrials = trials.filter(t => t.id !== currentTrial.id);
        if (remainingTrials.length > 0) {
          navigate(`/trials/${remainingTrials[0].id}`, { replace: true });
        } else {
          navigate('/shows', { replace: true });
        }
      }
    }
    setDeleteTrialDialogOpen(false);
  };

  const handleConfirmDeleteClass = () => {
    if (selectedClassForDelete && currentTrial) {
      const updatedClasses =
        currentTrial.classes?.filter(cls => cls.id !== selectedClassForDelete.id) || [];
      updateTrial(
        currentTrial.id,
        { ...currentTrial, classes: updatedClasses } as Partial<TrialInput>,
        user?.id || 'unknown'
      );
      deleteClass(selectedClassForDelete.id);
    }
    setDeleteClassDialogOpen(false);
    setSelectedClassForDelete(null);
  };

  return (
    <>
      <AddClassesToTrialPanel
        open={addClassesFromTemplateDialogOpen}
        onClose={() => setAddClassesFromTemplateDialogOpen(false)}
        onSave={handleSaveClassesFromTemplate}
        availableTemplates={templates}
        trialName={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
        trialOrganization={showOrganization}
        existingClasses={existingClasses}
        showId={currentTrial?.showId}
      />

      <TrialEditPanel
        open={editTrialPanelOpen}
        onClose={() => setEditTrialPanelOpen(false)}
        trialId={currentTrial?.id || ''}
        trialName={currentTrial?.type || currentTrial?.trialNumber || ''}
        initialTrialData={currentTrial || {}}
        {...(showOrganization ? { organization: showOrganization } : {})}
        onSave={async trialData => {
          if (currentTrial?.id) {
            updateTrial(
              currentTrial.id,
              { ...currentTrial, ...trialData } as Partial<TrialInput>,
              user?.id || 'unknown'
            );
            setEditTrialPanelOpen(false);
          }
        }}
      />

      <StandardDialog
        open={deleteTrialDialogOpen}
        onClose={() => setDeleteTrialDialogOpen(false)}
        onSave={handleConfirmDeleteTrial}
        title="Delete Trial"
        description={null}
        saveLabel="Delete Trial"
        cancelLabel="Cancel"
        saveButtonProps={{ variant: 'destructive' }}
        hideSave={false}
      >
        <div className="py-2 text-foreground space-y-3">
          <p>
            Are you sure you want to delete <b>{currentTrial?.type || currentTrial?.trialNumber}</b>
            ?
          </p>
          <p className="text-muted-foreground text-sm">
            This will permanently delete the trial along with all of its classes and entries.
          </p>
          <p className="text-destructive text-sm font-medium">This action cannot be undone.</p>
        </div>
      </StandardDialog>

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

      <AlertDialog open={deleteClassDialogOpen} onOpenChange={setDeleteClassDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this class?
              {selectedClassForDelete && (
                <span className="block mt-2 font-medium text-foreground">
                  {selectedClassForDelete.element} {selectedClassForDelete.level}{' '}
                  {selectedClassForDelete.section}
                </span>
              )}
              {(() => {
                const entryCount = selectedClassForDelete
                  ? (entryCountByClass.get(selectedClassForDelete.id) ?? 0)
                  : 0;
                if (entryCount === 0) return null;
                return (
                  <span className="block mt-2 text-destructive">
                    This will also delete {entryCount} {entryCount === 1 ? 'entry' : 'entries'} for
                    this class.
                  </span>
                );
              })()}
              <span className="block mt-2 text-destructive">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteClass}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
