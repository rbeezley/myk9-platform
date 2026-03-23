/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { startTransition, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Calendar, Pencil, ClipboardEdit } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { upsertClassJudgeAssignment } from '@/services/database/queries/judgeQueries';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
import type { ClassStatusValue } from '@myk9/core';
import { Button } from '@/components/ui/button';

import { useClassDetailsData } from './useClassDetailsData';
import { useClassDetailsDialogs } from './useClassDetailsDialogs';
import { ClassNotFoundState, EmptyClassState, LoadingClassState } from './ClassStates';
import { DeleteClassDialog } from './DeleteClassDialog';
import { EditEntryDialog } from './EditEntryDialog';
import { DeleteEntryDialog } from './DeleteEntryDialog';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero, getStatusBadge } from '@/components/common/DetailHero';

const ClassDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isSecretary, isAdmin } = useAuthContext();

  // Data hook
  const {
    classId,
    trialId,
    isResultsView,
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

  const handleViewTrial = () => {
    if (currentClass?.trialId) {
      startTransition(() => {
        navigate(`/trials/${currentClass.trialId}`);
      });
    }
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

  const handleStatusChange = async (newStatus: string) => {
    if (classId) {
      try {
        await updateClass(classId, { status: newStatus as ClassStatusValue });
        toast.success(`Class status updated to ${newStatus}`);
      } catch (error) {
        logger.error(
          'Failed to update class status',
          'classes',
          { classId, newStatus },
          error as Error
        );
        toast.error('Failed to update class status');
      }
    }
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
    const classLabel = currentClass
      ? `${currentClass.element || ''} ${currentClass.level || ''}`.trim() || 'Class'
      : 'Class';
    crumbs.push({ label: classLabel, href: `/classes/${classId}` });
    return crumbs;
  }, [parentShow, parentTrial, currentClass, classId]);

  // Status badge
  const statusBadge = useMemo(() => getStatusBadge(currentClass?.status), [currentClass?.status]);

  // Hero metadata
  const heroMetadata = useMemo(() => {
    const items = [];
    if (currentClass?.judge) {
      items.push({ label: `Judge: ${currentClass.judge}` });
    }
    if (currentClass?.trialDate) {
      items.push({
        label: new Date(currentClass.trialDate + 'T00:00:00').toLocaleDateString(),
        icon: <Calendar className="h-4 w-4" />,
      });
    }
    if (classEntries.length > 0) {
      items.push({
        label: `${classEntries.length} entr${classEntries.length !== 1 ? 'ies' : 'y'}`,
      });
    }
    return items;
  }, [currentClass?.judge, currentClass?.trialDate, classEntries.length]);

  // Action buttons
  const actionButtons = useMemo(() => {
    const buttons = [];
    if ((isSecretary || isAdmin) && classId) {
      buttons.push(
        <Button
          key="scores"
          variant="outline"
          size="sm"
          onClick={() => navigate(`/scoring/secretary/classes/${classId}`)}
        >
          <ClipboardEdit className="h-4 w-4 mr-2" />
          Enter Scores
        </Button>
      );
    }
    buttons.push(
      <Button key="edit" variant="outline" size="sm" onClick={dialogs.openEditClassPanel}>
        <Pencil className="h-4 w-4 mr-2" />
        Edit
      </Button>
    );
    return <>{buttons}</>;
  }, [isSecretary, isAdmin, classId, navigate, dialogs]);

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

  const className = `${currentClass.element || ''} ${currentClass.level || ''}`.trim() || 'Class';

  return (
    <PageShell>
      <PageHeader breadcrumbs={breadcrumbs} title={className} actions={actionButtons} />

      <DetailHero
        name={className}
        subtitle={currentClass.section ? `Section ${currentClass.section}` : undefined}
        metadata={heroMetadata}
        badge={statusBadge}
      />

      <ClassDetailsMain
        classData={currentClass}
        classEntries={classEntries}
        {...(parentShow !== undefined && { parentShow })}
        {...(parentTrial !== undefined && { parentTrial })}
        isResultsView={isResultsView}
        onEditClass={dialogs.openEditClassPanel}
        onDeleteClass={dialogs.openDeleteDialog}
        onEditPhoto={() => logger.debug('Edit photo not implemented', 'classes')}
        onViewTrial={handleViewTrial}
        onAddEntry={() => {
          if (parentShow?.id) {
            navigate(`/shows/${parentShow.id}/register`);
          }
        }}
        onDeleteEntry={handleDeleteEntry}
        onStatusChange={handleStatusChange}
        onResultUpdate={handleResultUpdate}
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
    </PageShell>
  );
};

export default ClassDetailsPage;
