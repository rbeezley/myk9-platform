/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { startTransition, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Pencil, MoreVertical, Trash2 } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { upsertClassJudgeAssignment } from '@/services/database/queries/judgeQueries';
import { replicatedClassesTable } from '@/services/replication';
import { useTrialStore } from '@/store/trialStore';
import { queryClient } from '@/lib/queryClient';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { ClassCompactHeader } from '@/components/classes/ClassCompactHeader';
import { ClassRequirementsPanel } from '@/components/classes/ClassRequirementsPanel';
import { formatClassTitle } from '@/components/classes/ClassDetailsMain.helpers';
import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
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

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';

const ClassDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();

  // Data hook
  const {
    classId,
    trialId,
    classes,
    currentClass,
    trialClasses,
    rawEntries,
    classEntries,
    parentTrial,
    parentShow,
    dogs,
    updateClass,
    deleteClass,
    updateResult,
  } = useClassDetailsData();

  // Dialog state
  const dialogs = useClassDetailsDialogs();
  const [requirementsPanelOpen, setRequirementsPanelOpen] = useState(false);

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
        await updateClass(classId, data as Partial<ClassData>);

        // Save judge assignment separately via judge_assignments table
        const judgeId = (data as Record<string, unknown>).judgeId as string | undefined;
        if (judgeId !== undefined && parentShow?.id) {
          try {
            await upsertClassJudgeAssignment(parentShow.id, classId, judgeId);
            // Refresh both data layers so UI reflects the new judge
            await replicatedClassesTable.sync('');
            useTrialStore.getState().loadTrialClasses();
            queryClient.invalidateQueries({ queryKey: ['classes'] });
          } catch (judgeError) {
            logger.warn('Failed to save judge assignment', 'classes', {
              classId,
              error: judgeError instanceof Error ? judgeError.message : String(judgeError),
            });
            toast.warning('Class saved, but judge assignment could not be saved');
          }
        }

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

  const handleResultUpdate = async (entryId: string, result: Partial<CompetitionResult>) => {
    try {
      const qualified =
        result.status === 'Qualified'
          ? true
          : result.status === 'Not Qualified'
            ? false
            : undefined;

      const storeUpdate = {
        time: result.time,
        qualified,
        qualification: result.status,
        qualificationReason: result.qualificationReason,
        score: result.score,
        placement: result.placement,
        recordedBy: 'secretary',
      };

      await updateResult(entryId, storeUpdate, user?.id || 'unknown');
    } catch (error) {
      logger.error('Failed to update result', 'classes', { entryId }, error as Error);
      throw error;
    }
  };

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

  // INTENT: Enter Scores button deliberately moved from page header to results
  // table header so it sits next to the data it acts on. Both secretaries and
  // exhibitors benefit from less clutter in the page header.

  // Action buttons for the compact header
  const headerActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
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
            <DropdownMenuItem onClick={dialogs.openDeleteDialog} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Class
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [dialogs.openEditClassPanel, dialogs.openDeleteDialog]
  );

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

      <ClassDetailsMain
        classData={currentClass}
        classEntries={classEntries}
        parentShow={parentShow}
        onAddEntry={() => {
          if (parentShow?.id) {
            navigate(`/shows/${parentShow.id}/register`);
          }
        }}
        onDeleteEntry={handleDeleteEntry}
        onResultUpdate={handleResultUpdate}
        onOpenRequirements={() => setRequirementsPanelOpen(true)}
      />

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
        rawEntries={rawEntries}
        dogs={dogs}
        onSave={handleSaveEntryEdit}
      />

      <DeleteEntryDialog
        open={dialogs.deleteEntryDialogOpen}
        onOpenChange={dialogs.setDeleteEntryDialogOpen}
        entryId={dialogs.entryToDelete}
        rawEntries={rawEntries}
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
    </PageShell>
  );
};

export default ClassDetailsPage;
