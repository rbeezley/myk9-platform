import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTemplateStore } from '@/store/templateStore';
import { useShowStore } from '@/store/showStore';
import TrialDetailsMain from '@/components/trials/TrialDetailsMain';
import { AddClassesToTrialPanel } from '@/components/classes/AddClassesToTrialPanel';
import { TrialEditPanel } from '@/components/panels/edit/TrialEditPanel';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { upsertClassJudgeAssignment } from '@/services/database/judges';
import { replicatedClassesTable } from '@/services/replication';
import { queryClient } from '@/lib/queryClient';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
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
import { TabsContent } from '@/components/ui/tabs';
import { PromoCodesSection } from '@/components/secretary/PromoCodesSection';
import { FinancialSummary } from '@/components/secretary/FinancialSummary';
import { TrialEntriesTable } from '@/components/trials/TrialDetail/TrialEntriesTable';
import { TrialClass } from '@/components/trials/types/trial.types';
import {
  Calendar,
  LayoutDashboard,
  ClipboardList,
  Tag,
  DollarSign,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu/ThreeDotMenu';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { getStatusBadge } from '@/components/common/detailHeroUtils';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { ErrorState } from '@/components/common/ErrorState';
import { useUrlTab } from '@/hooks/useUrlTab';

// Extracted hooks
import { useTrialStats, type EntryForStats } from '@/hooks/useTrialStats';
import { useTrialTemplates } from '@/hooks/useTrialTemplates';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { getShowLandingStyle } from '@/features/registries';
import { HeritageLandingPage } from '@/features/heritage/landing/HeritageLandingPage';

const TAB_IDS = ['overview', 'entries', 'promo-codes', 'financials'] as const;

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
  const { user, isSecretary, isAdmin } = useAuthContext();
  const { templates, initializeDefaultTemplates } = useTemplateStore();
  const { shows } = useShowStore();

  // Tab state — URL-synced
  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'overview');

  // Panel state
  const [editTrialPanelOpen, setEditTrialPanelOpen] = useState(false);
  const [deleteTrialDialogOpen, setDeleteTrialDialogOpen] = useState(false);
  const [addClassesFromTemplateDialogOpen, setAddClassesFromTemplateDialogOpen] = useState(false);
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<TrialClass | null>(null);
  const [deleteClassDialogOpen, setDeleteClassDialogOpen] = useState(false);
  const [selectedClassForDelete, setSelectedClassForDelete] = useState<TrialClass | null>(null);

  // Get classes store
  const { addClass, classes, updateClass, deleteClass } = useClassStoreCompat();

  const { data: trialEntries = [] } = useTrialEntries(trialId || '');

  // Set selected trial based on URL parameter
  useEffect(() => {
    if (trialId) selectTrial(trialId);
  }, [trialId, selectTrial]);

  // Templates power the "Add Classes" panel; load them once on mount so the
  // panel never opens to an empty list. Initializer is idempotent.
  useEffect(() => {
    initializeDefaultTemplates();
  }, [initializeDefaultTemplates]);

  // Get current trial
  const currentTrial = trials.find(trial => trial.id === selectedTrialId) as
    | (import('@/components/trials/types/trial.types').Trial & { classes?: TrialClass[] })
    | undefined;

  // Get the parent show
  const parentShow = currentTrial ? shows.find(show => show.id === currentTrial.showId) : undefined;
  const showOrganization = parentShow?.organization;

  // Sibling trials for prev/next navigation
  const showTrials = currentTrial
    ? trials.filter(trial => trial.showId === currentTrial.showId)
    : [];
  const currentTrialIndex = showTrials.findIndex(t => t.id === selectedTrialId);
  const prevTrialId = currentTrialIndex > 0 ? showTrials[currentTrialIndex - 1]?.id : null;
  const nextTrialId =
    currentTrialIndex < showTrials.length - 1 ? showTrials[currentTrialIndex + 1]?.id : null;

  const handlePrevTrial = () => {
    if (prevTrialId) {
      navigate(showId ? `/shows/${showId}/trials/${prevTrialId}` : `/trials/${prevTrialId}`);
    }
  };

  const handleNextTrial = () => {
    if (nextTrialId) {
      navigate(showId ? `/shows/${showId}/trials/${nextTrialId}` : `/trials/${nextTrialId}`);
    }
  };

  // Single pass over trialEntries: build count map + stats array
  const { entryCountByClass, trialEntriesForStats } = useMemo(() => {
    const countMap = new Map<string, number>();
    const statsArr: EntryForStats[] = [];
    for (const e of trialEntries) {
      countMap.set(e.class_id, (countMap.get(e.class_id) ?? 0) + 1);
      const status = e.entry_status ?? undefined;
      statsArr.push(
        status !== undefined ? { classId: e.class_id, status } : { classId: e.class_id }
      );
    }
    return { entryCountByClass: countMap, trialEntriesForStats: statsArr };
  }, [trialEntries]);

  // Compute trial with classes
  const trialWithClasses = useMemo(() => {
    if (!currentTrial) return undefined;
    const trialClasses = classes.filter(c => c.trialId === currentTrial.id);
    const convertedClasses = trialClasses.map(classData => {
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
        judgeId: ((classData as unknown as Record<string, unknown>).judgeId as string) || 'TBD',
        judgeName: classData.judge || 'TBD',
        startTime,
        entries: entryCountByClass.get(classData.id) ?? 0,
      };
    });
    return {
      ...currentTrial,
      classes: convertedClasses.length > 0 ? convertedClasses : currentTrial.classes || [],
    };
  }, [currentTrial, classes, entryCountByClass]);

  const trialStatistics = useTrialStats(trialWithClasses, trialEntriesForStats);
  const { handleSaveClassesFromTemplate } = useTrialTemplates({
    currentTrial,
    updateTrial,
    addClass,
    userId: user?.id || 'unknown',
  });

  // Tab definitions with icons and counts
  const classCount = trialWithClasses?.classes?.length ?? 0;
  const entryCount = trialStatistics.entries.total;
  const tabDefs: PrimaryTabDef[] = useMemo(() => {
    const tabs: PrimaryTabDef[] = [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'entries', label: 'Entries', icon: ClipboardList, count: entryCount },
    ];
    if (isSecretary || isAdmin) {
      tabs.push({ id: 'promo-codes', label: 'Promo Codes', icon: Tag });
      tabs.push({ id: 'financials', label: 'Financials', icon: DollarSign });
    }
    return tabs;
  }, [entryCount, isSecretary, isAdmin]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Shows', href: '/shows' }];
    if (parentShow) {
      crumbs.push({ label: parentShow.name, href: `/shows/${parentShow.id}` });
    }
    const trialLabel = currentTrial?.type || currentTrial?.trialNumber || 'Trial';
    const trialHref = showId ? `/shows/${showId}/trials/${trialId}` : `/trials/${trialId}`;
    crumbs.push({ label: trialLabel, href: trialHref });
    return crumbs;
  }, [parentShow, currentTrial, showId, trialId]);

  const statusBadge = useMemo(() => getStatusBadge(currentTrial?.status), [currentTrial?.status]);

  // Metadata for DetailHero — must be before early returns (rules of hooks)
  const heroMetadata = useMemo(() => {
    const items = [];
    if (currentTrial?.trialDate) {
      items.push({
        label: new Date(currentTrial.trialDate + 'T00:00:00').toLocaleDateString(),
        icon: <Calendar className="h-4 w-4" />,
      });
    }
    if (classCount > 0) {
      items.push({
        label: `${classCount} class${classCount !== 1 ? 'es' : ''}`,
      });
    }
    return items;
  }, [currentTrial?.trialDate, classCount]);

  // Prev/next navigation for hero
  const prevNextNav = (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!prevTrialId}
        onClick={handlePrevTrial}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-xs text-muted-foreground px-1">
        {currentTrialIndex + 1}/{showTrials.length}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={!nextTrialId}
        onClick={handleNextTrial}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  // Not found state
  if (trialId && !currentTrial && trials.length > 0) {
    return (
      <PageShell>
        <ErrorState
          message="The trial you're looking for doesn't exist."
          onRetry={() => navigate(showId ? `/shows/${showId}` : '/shows')}
        />
      </PageShell>
    );
  }

  // Heritage landing page branch — renders instead of the secretary/admin UI when
  // the parent show has landing_style === 'heritage'. All hooks above fire
  // unconditionally so this early return is safe (no hooks-after-conditional issue).
  //
  // Casts: shows.landing_style was added in migration 192; frontend types will
  // re-tighten after `supabase gen types typescript` runs. The store's SyncableTrial
  // shape is structurally compatible with the data hook's TrialLike at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (getShowLandingStyle(parentShow as any) === 'heritage') {
    return (
      <HeritageLandingPage
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        show={parentShow as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        trial={(currentTrial as any) ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allTrials={showTrials as any[]}
      />
    );
  }

  // Handler wrappers
  const handleEditTrial = () => setEditTrialPanelOpen(true);
  const handleDeleteTrial = () => setDeleteTrialDialogOpen(true);
  const handleAddClassesFromTemplate = () => setAddClassesFromTemplateDialogOpen(true);

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

  const handleEditClass = (classItem: TrialClass) => {
    setSelectedClassForEdit(classItem);
    setEditClassPanelOpen(true);
  };

  const handleDeleteClass = (classItem: TrialClass) => {
    setSelectedClassForDelete(classItem);
    setDeleteClassDialogOpen(true);
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
    <PageShell>
      {trialWithClasses ? (
        <>
          <PageHeader
            breadcrumbs={breadcrumbs}
            title={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
          />

          <DetailHero
            name={currentTrial?.type || currentTrial?.trialNumber || 'Trial'}
            subtitle={
              currentTrial?.type !== currentTrial?.trialNumber
                ? currentTrial?.trialNumber
                : undefined
            }
            metadata={heroMetadata}
            badges={statusBadge ? [statusBadge] : []}
            secondaryActions={
              <div className="flex items-center gap-2">
                {showTrials.length > 1 && prevNextNav}
                {(isSecretary || isAdmin) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate(
                        `/secretary/entries/${currentTrial?.showId || showId}?trial=${trialId}`
                      )
                    }
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Manage Entries
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleEditTrial}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <ThreeDotMenu
                  items={[
                    {
                      label: 'Delete Trial',
                      icon: <Trash2 className="h-4 w-4" />,
                      onClick: handleDeleteTrial,
                      className: 'text-destructive',
                    },
                  ]}
                />
              </div>
            }
          />

          <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value="overview">
              <TrialDetailsMain
                trial={trialWithClasses}
                statistics={trialStatistics}
                onAddClassesFromTemplate={handleAddClassesFromTemplate}
                onEditClass={handleEditClass}
                onDeleteClass={handleDeleteClass}
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
          </PrimaryTabs>
        </>
      ) : (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
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
    </PageShell>
  );
};

export default TrialDetailsPage;
