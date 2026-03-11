/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { startTransition, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Info, Calendar, Building2, Trophy, ClipboardEdit } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { useEntryStore } from '@/store/entryStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { RecordPageLayout } from '@/components/layout/record';
import type { PropertySectionConfig, AssociationConfig } from '@/components/layout/record';
import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
import type { ClassStatusValue } from '@myk9/core';

import { useClassDetailsData } from './useClassDetailsData';
import { useClassDetailsDialogs } from './useClassDetailsDialogs';
import { ClassNotFoundState, EmptyClassState, LoadingClassState } from './ClassStates';
import { DeleteClassDialog } from './DeleteClassDialog';
import { EditEntryDialog } from './EditEntryDialog';
import { DeleteEntryDialog } from './DeleteEntryDialog';

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
      logger.debug('handleResultUpdate called', 'classes', { entryId, result });

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
      logger.debug('updateResult called successfully', 'classes', { entryId });
    } catch (error) {
      logger.error('Failed to update result', 'classes', { entryId }, error as Error);
      throw error;
    }
  };

  // Left sidebar: class properties
  const classProperties: PropertySectionConfig[] = useMemo(() => {
    if (!currentClass) return [];
    return [
      {
        key: 'details',
        title: 'Class Details',
        icon: Info,
        iconGradient: 'from-blue-500/10 to-indigo-500/5',
        iconColor: 'text-blue-600 dark:text-blue-400',
        fields: [
          { label: 'Element', value: currentClass.element || null },
          { label: 'Level', value: currentClass.level || null },
          { label: 'Section', value: currentClass.section || null },
          { label: 'Judge', value: currentClass.judge || null },
          {
            label: 'Class Order',
            value: currentClass.classOrder ? `#${currentClass.classOrder}` : null,
          },
          { label: 'Status', value: currentClass.status || null },
        ],
      },
      {
        key: 'timing',
        title: 'Timing',
        icon: Calendar,
        iconGradient: 'from-amber-500/10 to-orange-500/5',
        iconColor: 'text-amber-600 dark:text-amber-400',
        fields: [
          { label: 'Time Limit', value: currentClass.timeLimit1 || null },
          {
            label: 'Trial Date',
            value: currentClass.trialDate
              ? new Date(currentClass.trialDate).toLocaleDateString()
              : null,
          },
        ],
      },
    ];
  }, [currentClass]);

  // Right sidebar: associations
  const classAssociations: AssociationConfig[] = useMemo(() => {
    const items: AssociationConfig[] = [];
    if (parentTrial) {
      const trialAssoc: AssociationConfig = {
        key: 'trial',
        title: parentTrial.type || parentTrial.trialNumber || 'Trial',
        icon: Trophy,
        href: `/trials/${parentTrial.id}`,
      };
      if (parentTrial.trialDate)
        trialAssoc.subtitle = new Date(parentTrial.trialDate).toLocaleDateString();
      items.push(trialAssoc);
    }
    if (parentShow) {
      const showAssoc: AssociationConfig = {
        key: 'show',
        title: parentShow.name,
        icon: Building2,
        href: `/shows/${parentShow.id}`,
      };
      if (parentShow.organization) showAssoc.subtitle = parentShow.organization;
      items.push(showAssoc);
    }
    const entryCount = classEntries.length;
    if (entryCount > 0) {
      items.push({
        key: 'entries',
        title: 'Entries',
        subtitle: `${entryCount} entr${entryCount !== 1 ? 'ies' : 'y'}`,
        icon: Calendar,
        badge: String(entryCount),
      });

      // Secretary/admin: quick link to enter scores
      if ((isSecretary || isAdmin) && classId) {
        items.push({
          key: 'enter-scores',
          title: 'Enter Scores',
          subtitle: 'Open scoring flow',
          icon: ClipboardEdit,
          href: `/scoring/secretary/classes/${classId}`,
        });
      }
    }
    return items;
  }, [parentTrial, parentShow, classEntries.length, isSecretary, isAdmin, classId]);

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
    <div className="min-h-screen bg-background">
      <RecordPageLayout
        className="py-6"
        storageKey="myk9:class"
        properties={classProperties}
        associations={classAssociations}
        tabsContent={
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
        }
      />

      {/* Dialogs */}
      <ClassEditPanel
        open={dialogs.editClassPanelOpen}
        onClose={dialogs.closeEditClassPanel}
        classId={currentClass?.id || ''}
        className={currentClass?.element || ''}
        initialClassData={currentClass || {}}
        mode="full"
        onSave={async classData => {
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
