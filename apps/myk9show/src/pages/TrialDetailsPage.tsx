import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTemplateStore } from '@/store/templateStore';
import { useShowStore } from '@/store/showStore';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PromoCodesSection } from '@/components/secretary/PromoCodesSection';
import { FinancialSummary } from '@/components/secretary/FinancialSummary';
import { TrialEntriesTable } from '@/components/trials/TrialDetail/TrialEntriesTable';
import { Trial, TrialClass } from '@/components/trials/types/trial.types';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import { TrialStatisticsData } from '@/components/trials/TrialDetail/TrialStatistics';
import { useRememberedTab } from '@/hooks/useRememberedTab';
import { RecordPageLayout } from '@/components/layout/record';
import type { PropertySectionConfig, AssociationConfig } from '@/components/layout/record';
import { Calendar, Info, Building2 } from 'lucide-react';

const TrialDetailsPage: React.FC = () => {
  const { trialId, showId } = useParams<{ trialId: string; showId?: string }>();
  const navigate = useNavigate();
  const {
    trials,
    selectedTrialId,
    selectTrial,
    updateTrial,
    deleteTrial: deleteTrialAsync,
  } = useTrialStore();
  const { user } = useAuthContext();
  const { templates } = useTemplateStore();
  const { shows } = useShowStore();

  // Templates will be automatically initialized by the store on app start
  // No need to initialize here to avoid duplicates

  // Tab state
  const [activeTab, setActiveTab] = useRememberedTab('trial-details', 'overview');

  // Panel state
  const [editTrialPanelOpen, setEditTrialPanelOpen] = useState(false);
  const [deleteTrialDialogOpen, setDeleteTrialDialogOpen] = useState(false);
  const [addClassesFromTemplateDialogOpen, setAddClassesFromTemplateDialogOpen] = useState(false);
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<TrialClass | null>(null);
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false);
  const [selectedClassForDelete, setSelectedClassForDelete] = useState<TrialClass | null>(null);

  // Get classes store
  const {
    addClass,
    classes,
    entries: allEntries,
    updateClass,
    deleteClass,
  } = useClassStoreCompat();

  // Set selected trial based on URL parameter
  useEffect(() => {
    logger.debug('TrialDetailsPage useEffect - trialId from URL', 'trials', { trialId });
    if (trialId) {
      logger.debug('TrialDetailsPage - Selecting trial', 'trials', { trialId });
      // Always select the trial from URL, regardless of current state
      selectTrial(trialId);
    }
  }, [trialId, selectTrial]);

  // Get current trial with proper type
  const currentTrial = trials.find(trial => trial.id === selectedTrialId) as
    | (Trial & { classes?: TrialClass[] })
    | undefined;

  // Debug logging
  useEffect(() => {
    logger.debug('TrialDetailsPage - state update', 'trials', {
      trialIdFromUrl: trialId,
      selectedTrialId,
      currentTrialId: currentTrial?.id,
      availableTrials: trials.map(t => ({ id: t.id, type: t.type })),
    });
  }, [trialId, selectedTrialId, currentTrial, trials]);

  // Get the parent show's organization
  const parentShow = currentTrial ? shows.find(show => show.id === currentTrial.showId) : undefined;
  const showOrganization = parentShow?.organization;

  // Filter trials to only show trials from the same show
  const showTrials = currentTrial
    ? trials.filter(trial => trial.showId === currentTrial.showId)
    : [];

  // Calculate navigation indices for prev/next trial
  const currentTrialIndex = showTrials.findIndex(t => t.id === selectedTrialId);
  const prevTrialId = currentTrialIndex > 0 ? showTrials[currentTrialIndex - 1]?.id : null;
  const nextTrialId =
    currentTrialIndex < showTrials.length - 1 ? showTrials[currentTrialIndex + 1]?.id : null;

  // Navigation handlers
  const handlePrevTrial = () => {
    if (prevTrialId) {
      const url = showId ? `/shows/${showId}/trials/${prevTrialId}` : `/trials/${prevTrialId}`;
      navigate(url);
    }
  };

  const handleNextTrial = () => {
    if (nextTrialId) {
      const url = showId ? `/shows/${showId}/trials/${nextTrialId}` : `/trials/${nextTrialId}`;
      navigate(url);
    }
  };

  // Debug logging for show type inheritance
  if (currentTrial) {
    logger.debug('TrialDetailsPage - show type inheritance', 'trials', {
      currentTrialId: currentTrial.id,
      parentShowId: parentShow?.id,
      showOrganization,
    });
  }

  // Compute trial with classes using useMemo instead of mutating the store object
  // This ensures we don't modify the original store data during render
  const trialWithClasses = useMemo(() => {
    if (!currentTrial) return undefined;

    const trialClasses = classes.filter(c => c.trialId === currentTrial.id);

    const convertedClasses = trialClasses.map(classData => {
      const classEntryCount = allEntries.filter(e => e.classId === classData.id).length;
      const startTime =
        classData.startTime ||
        (classData.trialDate ? `${classData.trialDate}T09:00:00` : new Date().toISOString());

      return {
        id: classData.id,
        element: classData.element || 'Unknown',
        level: classData.level || 'Unknown',
        section: classData.section || 'A',
        status:
          classData.status === 'Scheduled'
            ? 'Upcoming'
            : (classData.status as 'Upcoming' | 'In Progress' | 'Completed' | 'Cancelled'),
        judgeId: classData.judge || 'TBD',
        judgeName: classData.judge || 'TBD',
        startTime,
        entries: classEntryCount,
      };
    });

    // Return a new object with classes merged in, without mutating the original
    return {
      ...currentTrial,
      classes: convertedClasses.length > 0 ? convertedClasses : currentTrial.classes || [],
    };
  }, [currentTrial, classes, allEntries]);

  // Generate statistics for the trial
  const trialStatistics: TrialStatisticsData = useMemo(() => {
    if (!trialWithClasses || !trialWithClasses.classes) {
      return {
        judges: { total: 0, active: 0, onBreak: 0, percentChange: 0 },
        classes: { total: 0, upcoming: 0, completed: 0, percentChange: 0 },
        entries: { total: 0, upcoming: 0, completed: 0, percentChange: 0 },
        qualifiedRate: { percent: 0, qualified: 0, total: 0, percentChange: 0 },
      };
    }

    const totalClasses = trialWithClasses.classes.length;
    const completedClasses = trialWithClasses.classes.filter(
      (c: TrialClass) => c.status === 'Completed'
    ).length;
    const upcomingClasses = totalClasses - completedClasses;

    const totalEntries = trialWithClasses.classes.reduce(
      (sum: number, c: TrialClass) => sum + (c.entries || 0),
      0
    );
    const completedEntries = trialWithClasses.classes
      .filter((c: TrialClass) => c.status === 'Completed')
      .reduce((sum: number, c: TrialClass) => sum + (c.entries || 0), 0);
    const upcomingEntries = totalEntries - completedEntries;

    // Count unique judges from class assignments
    const uniqueJudges = new Set(
      trialWithClasses.classes
        .map((c: TrialClass) => c.judgeId)
        .filter((id: string) => id && id !== 'TBD')
    );
    const totalJudges = uniqueJudges.size;
    const activeJudges =
      trialWithClasses.status === 'In Progress'
        ? trialWithClasses.classes
            .filter((c: TrialClass) => c.status === 'In Progress')
            .reduce((judges: Set<string>, c: TrialClass) => {
              if (c.judgeId && c.judgeId !== 'TBD') judges.add(c.judgeId);
              return judges;
            }, new Set<string>()).size
        : 0;

    // Count qualified entries from actual competition results
    const trialEntries = allEntries.filter(e =>
      trialWithClasses.classes.some((c: TrialClass) => c.id === e.classId)
    );
    const qualifiedEntries = trialEntries.filter(e => e.status === 'Qualified').length;
    const scoredEntries = trialEntries.filter(
      e => e.status === 'Qualified' || e.status === 'Not Qualified'
    ).length;

    return {
      judges: {
        total: totalJudges,
        active: activeJudges,
        onBreak: 0,
        percentChange: totalJudges > 0 ? Math.round((activeJudges / totalJudges) * 100) : 0,
      },
      classes: {
        total: totalClasses,
        upcoming: upcomingClasses,
        completed: completedClasses,
        percentChange: totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0,
      },
      entries: {
        total: totalEntries,
        upcoming: upcomingEntries,
        completed: completedEntries,
        percentChange: totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0,
      },
      qualifiedRate: {
        percent: scoredEntries > 0 ? Math.round((qualifiedEntries / scoredEntries) * 100) : 0,
        qualified: qualifiedEntries,
        total: scoredEntries,
        percentChange: scoredEntries > 0 ? Math.round((qualifiedEntries / scoredEntries) * 100) : 0,
      },
    };
  }, [trialWithClasses, allEntries]);

  // Left sidebar: trial properties
  const trialProperties: PropertySectionConfig[] = useMemo(() => {
    if (!currentTrial) return [];
    return [
      {
        key: 'details',
        title: 'Trial Details',
        icon: Info,
        iconGradient: 'from-blue-500/10 to-indigo-500/5',
        iconColor: 'text-blue-600 dark:text-blue-400',
        fields: [
          { label: 'Type', value: currentTrial.type || null },
          { label: 'Trial Number', value: currentTrial.trialNumber || null },
          {
            label: 'Date',
            value: currentTrial.trialDate
              ? new Date(currentTrial.trialDate).toLocaleDateString()
              : null,
          },
          { label: 'Status', value: currentTrial.status || null },
          { label: 'Event Number', value: currentTrial.eventNumber || null },
        ],
      },
    ];
  }, [currentTrial]);

  // Right sidebar: associations
  const trialAssociations: AssociationConfig[] = useMemo(() => {
    const items: AssociationConfig[] = [];
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
    const classCount = trialWithClasses?.classes?.length ?? 0;
    if (classCount > 0) {
      items.push({
        key: 'classes',
        title: 'Classes',
        subtitle: `${classCount} class${classCount !== 1 ? 'es' : ''}`,
        icon: Calendar,
        badge: String(classCount),
      });
    }
    return items;
  }, [parentShow, trialWithClasses]);

  // Handle case where trial doesn't exist - moved after hooks
  if (trialId && !currentTrial && trials.length > 0) {
    return (
      <div className="myk9-show-page flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Trial Not Found</h1>
          <p className="text-muted-foreground mb-4">The trial you're looking for doesn't exist.</p>
          <button
            onClick={() => {
              const url = showId ? `/shows/${showId}` : '/trials';
              navigate(url);
            }}
            className="myk9-action-button myk9-action-button-primary"
          >
            {showId ? 'Back to Show' : 'Back to Trials'}
          </button>
        </div>
      </div>
    );
  }

  // Handler for editing a trial
  const handleEditTrial = () => {
    setEditTrialPanelOpen(true);
  };

  // Handler for deleting a trial
  const handleDeleteTrial = () => {
    setDeleteTrialDialogOpen(true);
  };

  const handleConfirmDeleteTrial = async () => {
    if (currentTrial) {
      await deleteTrialAsync(currentTrial.id);

      // Navigate based on context and remaining trials
      if (showId && currentTrial.showId) {
        // We came from a show context, go back to the show
        navigate(`/shows/${currentTrial.showId}`);
      } else {
        // Standalone trial route - navigate to remaining trials or shows list
        const remainingTrials = trials.filter(t => t.id !== currentTrial.id);
        if (remainingTrials.length > 0) {
          // Navigate to first remaining trial
          navigate(`/trials/${remainingTrials[0].id}`, { replace: true });
        } else {
          // No trials left, navigate to shows list
          navigate('/shows', { replace: true });
        }
      }
    }
    setDeleteTrialDialogOpen(false);
  };

  const handleAddClassesFromTemplate = () => {
    setAddClassesFromTemplateDialogOpen(true);
  };

  const handleSaveClassesFromTemplate = (
    selectedClasses: ClassDefinition[],
    template: ClassTemplate,
    judgeAssignments: Array<{ classId: string; judgeId: string; judgeName: string }> = []
  ) => {
    if (!currentTrial) return;

    const existingClasses = currentTrial.classes || [];

    // Check for duplicates and filter out classes that already exist
    const isClassDuplicate = (classDef: ClassDefinition) => {
      return existingClasses.some(
        existingClass =>
          existingClass.element === classDef.element &&
          existingClass.level === (classDef.level || '') &&
          existingClass.section === (classDef.section || '')
      );
    };

    // Separate new classes from duplicates
    const newClasses = selectedClasses.filter(classDef => !isClassDuplicate(classDef));
    const duplicateClasses = selectedClasses.filter(classDef => isClassDuplicate(classDef));

    // Create class IDs that will be shared between TrialClass and ClassData
    const classIds = newClasses.map((_, index) => `class-${Date.now()}-${index}`);

    // Convert new ClassDefinitions to TrialClasses
    const newTrialClasses: TrialClass[] = newClasses.map((classDef, index) => {
      // Calculate start time for each class (assuming 15-minute intervals starting at 9:00 AM)
      const baseTime = new Date(`${currentTrial.trialDate}T09:00:00`);
      const classStartTime = new Date(
        baseTime.getTime() + (existingClasses.length + index) * 15 * 60 * 1000
      );

      // Find judge assignment for this class
      const judgeAssignment = judgeAssignments.find(ja => ja.classId === classDef.className);
      const judgeId = judgeAssignment?.judgeId || 'TBD';
      const judgeName = judgeAssignment?.judgeName || 'TBD';

      return {
        id: classIds[index],
        element: classDef.element,
        level: classDef.level || '',
        section: classDef.section || '',
        judgeId: judgeId,
        judgeName: judgeName,
        startTime: classStartTime.toISOString(),
        status: 'Upcoming' as const,
        entries: 0,
      };
    });

    // Also add classes to the classStore so they can be viewed in ClassDetailsPage
    const newClassDataItems = newClasses.map((classDef, index) => {
      // Find judge assignment for this class
      const judgeAssignment = judgeAssignments.find(ja => ja.classId === classDef.className);
      const judgeName = judgeAssignment?.judgeName || 'TBD';

      return {
        id: classIds[index],
        trialId: currentTrial.id,
        trial: currentTrial.name || currentTrial.type || 'Trial',
        trialDate: currentTrial.trialDate,
        trialNumber: currentTrial.trialNumber || '',
        classOrder: (existingClasses.length + index + 1).toString(),
        status: 'Scheduled' as const,
        judge: judgeName,
        className: classDef.className,
        classNumber: classDef.classNumber || '',
        element: classDef.element,
        level: classDef.level || '',
        section: classDef.section || '',
        hidesUsed: '',
        distractionsUsed: '',
        itemsUsed: '',
        timeLimit1: '3:00',
        timeLimit2: '',
        timeLimit3: '',
        photoUrl: '',
        entryFee: 30,
        maxEntries: 40,
        requiresJumpHeight: false,
      };
    });

    // Add classes to classStore
    newClassDataItems.forEach(classData => {
      addClass(classData);
    });

    // Add only new classes to current trial
    const updatedTrial = {
      ...currentTrial,
      classes: [...existingClasses, ...newTrialClasses],
    };

    updateTrial(updatedTrial.id, updatedTrial as Partial<TrialInput>, user?.id || 'unknown');

    // Provide feedback about duplicates
    if (duplicateClasses.length > 0) {
      logger.debug('Skipped duplicate classes', 'trials', {
        count: duplicateClasses.length,
        classes: duplicateClasses.map(cls => `${cls.element} ${cls.level} ${cls.section}`),
      });
    }

    if (newClasses.length > 0) {
      logger.info('Added classes from template', 'trials', {
        count: newClasses.length,
        templateName: template.templateName,
      });
    } else {
      logger.debug('No new classes added - all selected classes already exist', 'trials');
    }
  };

  const handleEditClass = (classItem: TrialClass) => {
    logger.debug('Edit class', 'trials', { classId: classItem.id, element: classItem.element });
    setSelectedClassForEdit(classItem);
    setEditClassPanelOpen(true);
  };

  const handleDeleteClass = (classItem: TrialClass) => {
    setSelectedClassForDelete(classItem);
    setDeleteClassDialogOpen(true);
  };

  const handleConfirmDeleteClass = () => {
    if (selectedClassForDelete && currentTrial) {
      logger.debug('Delete class', 'trials', {
        classId: selectedClassForDelete.id,
        element: selectedClassForDelete.element,
      });

      // Remove the class from the trial's classes array
      const updatedClasses =
        currentTrial.classes?.filter(cls => cls.id !== selectedClassForDelete.id) || [];

      const updatedTrial = {
        ...currentTrial,
        classes: updatedClasses,
      };

      updateTrial(updatedTrial.id, updatedTrial as Partial<TrialInput>, user?.id || 'unknown');

      // Also remove the class from the classStore
      deleteClass(selectedClassForDelete.id);
    }
    setDeleteClassDialogOpen(false);
    setSelectedClassForDelete(null);
  };

  // Layout assembly only
  return (
    <div className="min-h-screen bg-background">
      {trialWithClasses ? (
        <RecordPageLayout
          className="py-6"
          properties={trialProperties}
          associations={trialAssociations}
          tabsContent={
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="entries">Entries</TabsTrigger>
                <TabsTrigger value="promo-codes">Promo Codes</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <TrialDetailsMain
                  trial={trialWithClasses}
                  statistics={trialStatistics}
                  parentShow={
                    parentShow
                      ? {
                          id: parentShow.id,
                          name: parentShow.name,
                          organization: parentShow.organization,
                        }
                      : undefined
                  }
                  onEdit={handleEditTrial}
                  onDelete={handleDeleteTrial}
                  onAddClassesFromTemplate={handleAddClassesFromTemplate}
                  onEditClass={handleEditClass}
                  onDeleteClass={handleDeleteClass}
                  onPrevTrial={handlePrevTrial}
                  onNextTrial={handleNextTrial}
                  prevTrialId={prevTrialId}
                  nextTrialId={nextTrialId}
                  currentTrialIndex={currentTrialIndex}
                  totalTrials={showTrials.length}
                />
              </TabsContent>

              <TabsContent value="entries">
                <TrialEntriesTable trialId={trialWithClasses.id} />
              </TabsContent>

              <TabsContent value="promo-codes">
                <PromoCodesSection trialId={trialWithClasses.id} />
              </TabsContent>

              <TabsContent value="financials">
                <FinancialSummary trialId={trialWithClasses.id} />
              </TabsContent>
            </Tabs>
          }
        />
      ) : (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground text-lg">Loading trial...</p>
          </div>
        </div>
      )}

      {/* Dialogs */}

      <AddClassesToTrialPanel
        open={addClassesFromTemplateDialogOpen}
        onClose={() => setAddClassesFromTemplateDialogOpen(false)}
        onSave={handleSaveClassesFromTemplate}
        availableTemplates={templates}
        trialName={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
        trialOrganization={showOrganization}
        existingClasses={trialWithClasses?.classes || []}
        showId={currentTrial?.showId}
      />

      <TrialEditPanel
        open={editTrialPanelOpen}
        onClose={() => setEditTrialPanelOpen(false)}
        trialId={currentTrial?.id || ''}
        trialName={currentTrial?.type || currentTrial?.trialNumber || ''}
        initialTrialData={currentTrial || {}}
        onSave={async trialData => {
          if (currentTrial?.id) {
            const updatedTrial = { ...currentTrial, ...trialData };
            updateTrial(
              currentTrial.id,
              updatedTrial as Partial<TrialInput>,
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
        saveLabel="Delete"
        cancelLabel="Cancel"
        saveButtonProps={{
          variant: 'destructive',
          className: 'myk9-action-button myk9-action-button-danger',
        }}
        hideSave={false}
      >
        <div className="py-2 text-foreground">
          <p>
            Are you sure you want to delete <b>{currentTrial?.type || currentTrial?.trialNumber}</b>
            ?
          </p>
          <p className="mt-2 text-destructive">This action cannot be undone.</p>
        </div>
      </StandardDialog>

      <ClassEditPanel
        open={editClassPanelOpen}
        onClose={() => setEditClassPanelOpen(false)}
        classId={selectedClassForEdit?.id || ''}
        className={selectedClassForEdit?.element || ''}
        initialClassData={selectedClassForEdit || {}}
        mode="simple"
        onSave={async classData => {
          if (selectedClassForEdit?.id && classData.id) {
            const updatedClass = { ...selectedClassForEdit, ...classData };
            updateClass(selectedClassForEdit.id, updatedClass);
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
    </div>
  );
};

export default TrialDetailsPage;
