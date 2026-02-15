/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { useEffect, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ClassGroupedSidebar } from '@/components/classes/ClassGroupedSidebar';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
import type { ClassStatusValue } from '@myk9/core';

import { useClassDetailsData } from './useClassDetailsData';
import { useClassDetailsDialogs } from './useClassDetailsDialogs';
import { ClassNotFoundState, EmptyClassState, LoadingClassState } from './ClassStates';
import { DeleteClassDialog } from './DeleteClassDialog';
import { EditEntryDialog } from './EditEntryDialog';
import { AddEntryDialog } from './AddEntryDialog';
import { DeleteEntryDialog } from './DeleteEntryDialog';

const ClassDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();

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

  // Handle case where no classId in URL but we have classes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!classId && trialClasses.length > 0 && classes.length > 0) {
      const frameId = requestAnimationFrame(() => {
        startTransition(() => {
          navigate(`/classes/${trialClasses[0].id}`, { replace: true });
        });
      });
      return () => cancelAnimationFrame(frameId);
    }
    return;
  }, [classId, trialClasses, navigate, classes.length]);

  // Handlers
  const handleSelectClass = (id: string) => {
    startTransition(() => {
      navigate(`/classes/${id}`);
    });
  };

  const handleConfirmDeleteClass = () => {
    if (classId) {
      deleteClass(classId);
      startTransition(() => {
        if (trialId) {
          navigate(`/trials/${trialId}`);
        } else if (currentClass?.trialId) {
          navigate(`/trials/${currentClass.trialId}`);
        } else {
          navigate('/classes');
        }
      });
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

  const handleConfirmDeleteEntry = () => {
    if (dialogs.entryToDelete) {
      const { deleteEntry } = useEntryStore.getState();
      deleteEntry(dialogs.entryToDelete);
      dialogs.closeDeleteEntryDialog();
    }
  };

  const handleSaveClassEdit = (data: Partial<typeof currentClass>) => {
    if (classId && currentClass) {
      updateClass(classId, data as Partial<ClassData>);
    }
    dialogs.closeEditClassPanel();
  };

  const handleSaveEntryEdit = (data: Record<string, unknown>) => {
    if (dialogs.editEntryId) {
      logger.debug('Save entry', 'classes', { editEntryId: dialogs.editEntryId, data });
    }
    dialogs.closeEditEntryDialog();
  };

  const handleStatusChange = (newStatus: string) => {
    if (classId) {
      updateClass(classId, { status: newStatus as ClassStatusValue });
    }
  };

  const handleResultUpdate = async (entryId: string, result: Partial<CompetitionResult>) => {
    try {
      logger.debug('handleResultUpdate called', 'classes', { entryId, result });

      const qualified =
        result.status === 'Qualified' ? true : result.status === 'Not Qualified' ? false : undefined;

      const storeUpdate = {
        time: result.time,
        qualified,
        qualification: result.status,
        qualificationReason: result.qualificationReason,
        score: result.score,
        placement: result.placement,
        recordedBy: 'secretary',
      };

      updateResult(entryId, storeUpdate, user?.id || 'unknown');
      logger.debug('updateResult called successfully', 'classes', { entryId });
    } catch (error) {
      logger.error('Failed to update result', 'classes', { entryId }, error as Error);
      throw error;
    }
  };

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

  return (
    <div className="flex min-h-screen bg-background">
      <ClassGroupedSidebar
        classes={trialClasses}
        selectedId={classId || null}
        onSelect={handleSelectClass}
        searchTerm={dialogs.searchTerm}
        onSearchChange={dialogs.setSearchTerm}
      />

      <main className="flex-1 overflow-auto">
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
          onAddEntry={dialogs.openAddEntryDialog}
          onDeleteEntry={handleDeleteEntry}
          onStatusChange={handleStatusChange}
          onResultUpdate={handleResultUpdate}
        />
      </main>

      {/* Dialogs */}
      <ClassEditPanel
        open={dialogs.editClassPanelOpen}
        onClose={dialogs.closeEditClassPanel}
        classId={currentClass?.id || ''}
        className={currentClass?.element || ''}
        initialClassData={currentClass || {}}
        mode="full"
        onSave={async (classData) => {
          if (currentClass?.id && classData.id) {
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

      <AddEntryDialog
        open={dialogs.addEntryDialogOpen}
        onOpenChange={dialogs.setAddEntryDialogOpen}
        parentShow={parentShow}
        currentClass={currentClass}
      />

      <DeleteEntryDialog
        open={dialogs.deleteEntryDialogOpen}
        onOpenChange={dialogs.setDeleteEntryDialogOpen}
        entryId={dialogs.entryToDelete}
        rawEntries={rawEntries}
        dogs={dogs}
        onConfirm={handleConfirmDeleteEntry}
      />
    </div>
  );
};

export default ClassDetailsPage;
