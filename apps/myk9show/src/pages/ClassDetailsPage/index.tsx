/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { startTransition, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  MessageSquare,
  MoreVertical,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { useTrialStore } from '@/store/trialStore';
import { queryClient } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { ClassCompactHeader } from '@/components/classes/ClassCompactHeader';
import { ClassRequirementsPanel } from '@/components/classes/ClassRequirementsPanel';
import { formatClassTitle } from '@/components/classes/ClassDetailsMain.helpers';
import type { ClassData } from '@/components/classes/types/classTypes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useClassDetailsData } from './useClassDetailsData';
import { useClassDetailsDialogs } from './useClassDetailsDialogs';
import { ClassNotFoundState, EmptyClassState, LoadingClassState } from './ClassStates';
import { DeleteClassDialog } from './DeleteClassDialog';
import { EditEntryDialog } from './EditEntryDialog';
import { DeleteEntryDialog } from './DeleteEntryDialog';
import { ExhibitorClassCallout } from './ExhibitorClassCallout';
import { SecretaryRunSheet } from './SecretaryRunSheet';
import { useMyEntriesInClass } from './useMyEntriesInClass';
import { ComposeTargetedModal } from '@/features/messages/components/ComposeTargetedModal';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { getPaperScoringClassHref } from '@/pages/scoring/scoringRoutes';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';

const ClassDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSecretary, isAdmin } = useAuthContext();

  // Data hook
  const {
    classId,
    trialId,
    classes,
    currentClass,
    trialClasses,
    localRawEntries,
    dbRawEntries,
    classEntries,
    parentTrial,
    parentShow,
    dogs,
    updateClass,
    deleteClass,
  } = useClassDetailsData();

  // Dialog state
  const dialogs = useClassDetailsDialogs();
  const [requirementsPanelOpen, setRequirementsPanelOpen] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const { sendTargetedMessage } = useMessageMutations();
  const { myEntries } = useMyEntriesInClass(classId);
  const myEntryIds = useMemo(() => new Set(myEntries.map(entry => entry.entryId)), [myEntries]);

  // Handlers
  const handleConfirmDeleteClass = async () => {
    if (classId) {
      try {
        await deleteClass(classId);
        toast.success('Class deleted successfully');
        startTransition(() => {
          if (trialId) {
            navigate(`/trials/${trialId}`);
          } else if (currentClass?.trialId) {
            navigate(`/trials/${currentClass.trialId}`);
          } else {
            navigate('/classes');
          }
        });
      } catch (error) {
        logger.error('Failed to delete class', 'classes', { classId }, error as Error);
        toast.error('Failed to delete class');
      }
    }
    dialogs.closeDeleteDialog();
  };

  const handleDeleteEntry = (entryId: string) => {
    dialogs.openDeleteEntryDialog(entryId);
  };

  const handleConfirmDeleteEntry = async () => {
    if (dialogs.entryToDelete) {
      try {
        const { deleteEntry } = useEntryStore.getState();
        await deleteEntry(dialogs.entryToDelete);
        toast.success('Entry deleted successfully');
      } catch (error) {
        logger.error(
          'Failed to delete entry',
          'classes',
          { entryId: dialogs.entryToDelete },
          error as Error
        );
        toast.error('Failed to delete entry');
      }
      dialogs.closeDeleteEntryDialog();
    }
  };

  const handleSaveClassEdit = async (data: Partial<typeof currentClass>) => {
    if (classId && currentClass) {
      try {
        // Save judge assignment FIRST (with replication sync) before updateClass,
        // so React Query's onSuccess refetch reads fresh judge data from replication cache
        const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
        if (judgeId !== undefined && parentShow?.id) {
          try {
            await upsertClassJudgeAssignment(parentShow.id, classId, judgeId);
            // Refresh replication cache so updateClass's onSuccess invalidation refetches fresh judge data
            await replicatedClassesTable.sync('');
          } catch (judgeError) {
            logger.warn('Failed to save judge assignment', 'classes', {
              classId,
              error: judgeError instanceof Error ? judgeError.message : String(judgeError),
            });
            // Continue to class update even if judge assignment fails
          }
        }

        // Now update class — its onSuccess invalidation will refetch fresh judge data
        await updateClass(classId, data as Partial<ClassData>);

        useTrialStore.getState().loadTrialClasses();
        // Invalidate specific query keys for classes (safety net after fresh refetch)
        queryClient.invalidateQueries({ queryKey: classKeys.lists() });
        if (currentClass?.trialId) {
          queryClient.invalidateQueries({ queryKey: classKeys.byTrial(currentClass.trialId) });
        }
        queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });

        toast.success('Class updated successfully');
      } catch (error) {
        logger.error('Failed to update class', 'classes', { classId }, error as Error);
        toast.error('Failed to update class');
      }
    }
    dialogs.closeEditClassPanel();
  };

  const handleSaveEntryEdit = async (data: Record<string, unknown>) => {
    if (dialogs.editEntryId && Object.keys(data).length > 0) {
      try {
        const { updateEntry } = useEntryStore.getState();
        await updateEntry(dialogs.editEntryId, data, user?.id || 'unknown');
        toast.success('Entry updated successfully');
      } catch (error) {
        logger.error(
          'Failed to update entry',
          'classes',
          { editEntryId: dialogs.editEntryId },
          error as Error
        );
        toast.error('Failed to update entry');
      }
    }
    dialogs.closeEditEntryDialog();
  };

  const handleStartClass = useCallback(async () => {
    if (!currentClass?.id) return;
    try {
      await updateClass(currentClass.id, { status: 'In Progress' });
    } catch {
      toast.error('Failed to start class');
    }
  }, [currentClass, updateClass]);

  const handleCloseClass = useCallback(async () => {
    if (!currentClass?.id) return;
    try {
      await updateClass(currentClass.id, { status: 'Completed' });
    } catch {
      toast.error('Failed to close class');
    }
  }, [currentClass, updateClass]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Shows', href: '/shows' }];
    if (parentShow) {
      crumbs.push({ label: parentShow.name, href: `/shows/${parentShow.id}` });
    }
    if (parentTrial) {
      const trialLabel = parentTrial.type || parentTrial.trialNumber || 'Trial';
      crumbs.push({ label: trialLabel, href: `/trials/${parentTrial.id}` });
    }
    const classLabel = currentClass ? formatClassTitle(currentClass) || 'Class' : 'Class';
    crumbs.push({ label: classLabel, href: `/classes/${classId}` });
    return crumbs;
  }, [parentShow, parentTrial, currentClass, classId]);

  // INTENT: Secretary scoring has one canonical path: the paper-scoring split panel.
  // Keep class management and run-order work on this page, but route result entry
  // through the dedicated scoring flow so secretaries do not choose between tools.

  // Action buttons for the compact header
  const headerActions = useMemo(() => {
    const canStartClass =
      currentClass?.status !== 'In Progress' &&
      currentClass?.status !== 'Completed' &&
      currentClass?.status !== 'Cancelled';

    return (
      <div className="flex items-center gap-2">
        {(isSecretary || isAdmin) && (
          <Button
            size="sm"
            onClick={() => classId && navigate(getPaperScoringClassHref(classId))}
            disabled={!classId}
          >
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
            Score Class
          </Button>
        )}
        {(isSecretary || isAdmin) && parentShow?.id && (
          <Button variant="outline" size="sm" onClick={() => setShowMessageModal(true)}>
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Message Class
          </Button>
        )}
        {(isSecretary || isAdmin) && parentShow?.id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(
                `/secretary/entries/${parentShow.id}?trial=${trialId || currentClass?.trialId}${classId ? `&class=${classId}` : ''}`
              )
            }
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Manage Entries
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={dialogs.openEditClassPanel}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(isSecretary || isAdmin) && canStartClass && (
              <DropdownMenuItem onClick={handleStartClass}>
                <Play className="mr-2 h-4 w-4" />
                Mark In Progress
              </DropdownMenuItem>
            )}
            {(isSecretary || isAdmin) && currentClass?.status === 'In Progress' && (
              <DropdownMenuItem onClick={handleCloseClass}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Completed
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setRequirementsPanelOpen(true)}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Requirements
            </DropdownMenuItem>
            <DropdownMenuItem onClick={dialogs.openDeleteDialog} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Class
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }, [
    dialogs.openEditClassPanel,
    dialogs.openDeleteDialog,
    setRequirementsPanelOpen,
    setShowMessageModal,
    isSecretary,
    isAdmin,
    parentShow,
    trialId,
    currentClass?.trialId,
    currentClass?.status,
    classId,
    handleStartClass,
    handleCloseClass,
    navigate,
  ]);

  // Early returns for different states
  if (classId && !currentClass && trialClasses.length > 0) {
    return <ClassNotFoundState />;
  }

  if (!classId || !currentClass) {
    if (classes.length === 0) {
      return <EmptyClassState />;
    }
    return <LoadingClassState />;
  }

  const className = formatClassTitle(currentClass) || 'Class';

  return (
    <PageShell>
      <PageHeader breadcrumbs={breadcrumbs} title={className} />

      <ClassCompactHeader
        classData={currentClass}
        parentTrial={parentTrial}
        actions={headerActions}
      />

      {!isSecretary && !isAdmin && <ExhibitorClassCallout classId={classId} />}

      {isSecretary || isAdmin ? (
        <SecretaryRunSheet
          currentClass={currentClass}
          dbRawEntries={dbRawEntries}
          userId={user?.id ?? ''}
          myEntryIds={myEntryIds}
          dogs={dogs}
          organization={parentShow?.organization ?? null}
        />
      ) : (
        <ClassDetailsMain
          classData={currentClass}
          classEntries={classEntries}
          rawEntries={dbRawEntries}
          parentShow={parentShow}
          onAddEntry={() => {
            if (parentShow?.id) {
              navigate(`/shows/${parentShow.id}/register`);
            }
          }}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {/* Dialogs */}
      <ClassEditPanel
        open={dialogs.editClassPanelOpen}
        onClose={dialogs.closeEditClassPanel}
        classId={currentClass?.id || ''}
        className={currentClass?.element || ''}
        initialClassData={currentClass || {}}
        {...(parentShow?.id !== undefined && { showId: parentShow.id })}
        onSave={async classData => {
          if (currentClass?.id) {
            const updatedClass = { ...currentClass, ...classData };
            handleSaveClassEdit(updatedClass);
          }
        }}
      />

      <DeleteClassDialog
        open={dialogs.deleteDialogOpen}
        onOpenChange={dialogs.setDeleteDialogOpen}
        currentClass={currentClass}
        onConfirm={handleConfirmDeleteClass}
      />

      <EditEntryDialog
        open={dialogs.editEntryDialogOpen}
        onOpenChange={dialogs.setEditEntryDialogOpen}
        entryId={dialogs.editEntryId}
        rawEntries={localRawEntries}
        dogs={dogs}
        onSave={handleSaveEntryEdit}
      />

      <DeleteEntryDialog
        open={dialogs.deleteEntryDialogOpen}
        onOpenChange={dialogs.setDeleteEntryDialogOpen}
        entryId={dialogs.entryToDelete}
        rawEntries={localRawEntries}
        dogs={dogs}
        onConfirm={handleConfirmDeleteEntry}
      />

      <ClassRequirementsPanel
        open={requirementsPanelOpen}
        onClose={() => setRequirementsPanelOpen(false)}
        organization={parentShow?.organization || null}
        element={currentClass?.element || ''}
        level={currentClass?.level || ''}
      />

      {parentShow?.id && (
        <ComposeTargetedModal
          open={showMessageModal}
          onClose={() => setShowMessageModal(false)}
          onSend={(classId, body) => sendTargetedMessage(parentShow.id, classId, body)}
          classes={[
            {
              id: currentClass.id,
              class_number: Number(currentClass.classNumber ?? 0),
              class_name: currentClass.className ?? formatClassTitle(currentClass) ?? '',
              entry_count: classEntries.length,
            },
          ]}
          preSelectedClassId={currentClass.id}
        />
      )}
    </PageShell>
  );
};

export default ClassDetailsPage;
