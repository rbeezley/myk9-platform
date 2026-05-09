import React, { useState, useEffect, useMemo } from 'react';
import { getShowStyle } from '@/features/registries';
import { publishExperience } from '@/features/experience/publishExperience';
import { HeritageLandingPage } from '@/features/heritage/landing/HeritageLandingPage';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Trophy,
  ListChecks,
  ClipboardList,
  Medal,
  BarChart3,
  Trash2,
  Pencil,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import { ShowEditPanel } from '@/components/panels/edit/ShowEditPanel';
import DeleteShowDialog from '@/components/shows/ShowDetails/dialogs/DeleteShowDialog';
import { ShowOverviewTab } from '@/components/shows/tabs/ShowOverviewTab';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowResultsTab } from '@/components/results/ShowResultsTab';
import { TrialsTab, type TrialStats } from '@/components/shows/tabs/TrialsTab';
import type { ShowInput } from '@/store/showStore';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { GeneratedPremium } from '@/types/premium-types';
import {
  useShowsQuery,
  showQueryKeys,
} from '@/hooks/queries/useShowsDatabase';
import { useShowStore } from '@/store/showStore';
import { persistShowJudgeAssignments } from '@/services/database/judges';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { useMyEntries } from '@/hooks/useMyEntries';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import { getEntryStatus, type EntryStatus } from '@/utils/entryStatusUtils';
import { MyShowStatsTab } from '@/components/analytics/MyShowStatsTab';
import { ClassesTab } from '@/components/shows/tabs/ClassesTab';
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { LandingPageCard } from '@/features/premium/LandingPageCard';

// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { NotFoundState } from '@/components/common/NotFoundState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu/ThreeDotMenu';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { formatDateRange } from '@/utils/date-format';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';

const ENTRY_STATUS_HERO_VARIANT: Record<
  EntryStatus,
  'success' | 'warning' | 'destructive' | 'default'
> = {
  accepting: 'success',
  closing_soon: 'warning',
  closed: 'destructive',
  submitted: 'default',
  not_yet_open: 'default',
};

function parseOptionalCurrency(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function applyShowFormDataToPremium(
  premium: GeneratedPremium,
  formData: Partial<ShowInput>
): GeneratedPremium {
  const preEntryFee = parseOptionalCurrency(formData.preEntryFee);
  const dayOfFee = parseOptionalCurrency(formData.dayOfShowFee);

  return {
    ...premium,
    style: (formData.style ?? premium.style) as GeneratedPremium['style'],
    show: {
      ...premium.show,
      name: formData.name ?? premium.show.name,
      startDate: formData.startDate ?? premium.show.startDate,
      endDate: formData.endDate ?? premium.show.endDate,
      venue: formData.location ?? premium.show.venue,
      entryOpenDate: formData.entryOpenDate ?? premium.show.entryOpenDate,
      entryCloseDate: formData.entryCloseDate ?? premium.show.entryCloseDate,
      preEntryFee: preEntryFee ?? premium.show.preEntryFee,
      dayOfFee: dayOfFee ?? premium.show.dayOfFee,
      acceptChecks: formData.acceptCheckPayments ?? premium.show.acceptChecks,
      acceptCash: formData.acceptCashPayments ?? premium.show.acceptCash,
    },
    trials: premium.trials.map(trial => ({
      ...trial,
      judges:
        formData.assignedJudges?.map(judge => ({
          name: judge.judgeName,
          elements: judge.assignedClasses ?? [],
        })) ?? trial.judges,
    })),
  };
}

const ShowDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { endNavigation } = useNavigationPerformance();
  const { user, isSecretary, isAdmin, hasRole } = useAuthContext();
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const { data: showEntries = [] } = useEntriesByShowQuery(id || '', !!id);

  // Use fast show details loading with cache optimization
  const {
    showId,
    show: currentShow,
    isLoading: fastLoading,
    isError: fastError,
    refetch: refetchShow,
    isFromCache,
  } = useFastShowDetails(id);

  // Track navigation performance when data loads
  useEffect(() => {
    if (currentShow && !fastLoading) {
      endNavigation(isFromCache);
    }
  }, [currentShow, fastLoading, isFromCache, endNavigation]);

  const queryClient = useQueryClient();
  const { data: shows = [] } = useShowsQuery();

  const updateShowLocally = useShowStore(s => s.updateShow);

  // Panel state
  const [showEditPanel, setShowEditPanel] = useState(
    () => new URLSearchParams(window.location.search).get('edit') === 'true'
  );
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fallback: Find current show from database
  const actualCurrentShow = useMemo(() => {
    if (currentShow) return currentShow;
    if (id && shows.length > 0) {
      return shows.find(show => show.id === id) || null;
    }
    return null;
  }, [currentShow, id, shows]);

  const { data: armbandCount } = useArmbandCount(actualCurrentShow?.id);
  const canManageShow = isSecretary || isAdmin;

  // Get associated trials for secretary view
  const showId_ = actualCurrentShow?.id;
  const associatedTrials = useMemo(
    () =>
      showId_
        ? trials
            .filter(t => t.showId === showId_)
            .sort((a, b) => {
              const orderA = a.order ? parseInt(a.order, 10) : Infinity;
              const orderB = b.order ? parseInt(b.order, 10) : Infinity;
              if (orderA !== orderB) return orderA - orderB;
              return (a.trialDate || '').localeCompare(b.trialDate || '');
            })
        : [],
    [showId_, trials]
  );

  // Check if user has entries in this show (determines default tab)
  // Only enable polling when the My Entries tab is active (fix #3)
  const { entries: userEntries } = useMyEntries(showId_);
  const hasUserEntries = userEntries.length > 0;

  // Tab state — URL-synced with dynamic allowed tabs
  const isAuthenticated = !!user;
  const allowedTabs = useMemo(
    () =>
      isAuthenticated
        ? ['overview', 'trials', 'classes', 'my-entries', 'my-stats', 'results']
        : ['overview', 'trials', 'classes', 'results'],
    [isAuthenticated]
  );
  const [activeTab, setTab] = useUrlTab(allowedTabs, 'overview');

  // Flatten trial classes into ClassInfo for ClassesTab
  const showClasses = useMemo(() => {
    const userEntryClassIds = new Set(userEntries.map(e => e.id));
    return associatedTrials.flatMap(trial => {
      const classes: SyncableTrialClass[] = trialClasses[trial.id] || [];
      return classes.map(cls => ({
        id: cls.id,
        name: `${cls.element} ${cls.level}`,
        element: cls.element,
        level: cls.level,
        section: cls.section || '',
        judgeName: cls.judgeName || '',
        trialId: trial.id,
        time: cls.startTime || '',
        ring: 0,
        status: cls.status || CLASS_STATUS.SCHEDULED,
        entryCount: showEntries.filter((e: Record<string, unknown>) => e.class_id === cls.id)
          .length,
        scoredCount: cls.completedEntries ?? 0,
        userHasEntry: userEntryClassIds.has(cls.id),
        trialDate: trial.trialDate || '',
        trialNumber: trial.trialNumber || '',
        trialName: trial.name || '',
      }));
    });
  }, [associatedTrials, trialClasses, userEntries, showEntries]);

  // Derive unique judges from class-level assignments as fallback when
  // the judge_assignments table has no rows for this show
  const effectiveJudges = useMemo((): ShowJudgeAssignment[] => {
    if (actualCurrentShow?.assignedJudges && actualCurrentShow.assignedJudges.length > 0) {
      return actualCurrentShow.assignedJudges;
    }
    const judgeMap = new Map<string, ShowJudgeAssignment>();
    for (const cls of showClasses) {
      if (!cls.judgeName) continue;
      const existing = judgeMap.get(cls.judgeName);
      if (existing) {
        existing.assignedClasses = [...(existing.assignedClasses ?? []), cls.id];
      } else {
        judgeMap.set(cls.judgeName, {
          judgeId: cls.judgeName,
          judgeName: cls.judgeName,
          assignedDate: '',
          assignedClasses: [cls.id],
        });
      }
    }
    return Array.from(judgeMap.values());
  }, [actualCurrentShow, showClasses]);

  // Trial statistics for card display (class counts, entry counts, scoring progress)
  const trialStats = useMemo(() => {
    const stats: Record<string, TrialStats> = {};
    for (const trial of associatedTrials) {
      const classes = trialClasses[trial.id] || [];
      const classIdSet = new Set(classes.map(c => c.id));
      const trialEntryCount = showEntries.filter((e: Record<string, unknown>) =>
        classIdSet.has(e.class_id as string)
      ).length;
      stats[trial.id] = {
        classCount: classes.length,
        entryCount: trialEntryCount,
        completedClasses: classes.filter(cls => cls.status === CLASS_STATUS.COMPLETED).length,
      };
    }
    return stats;
  }, [associatedTrials, trialClasses, showEntries]);

  // Redirect if no show ID
  useEffect(() => {
    if (!id) {
      navigate('/shows', { replace: true });
    }
  }, [id, navigate]);

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    queryClient.invalidateQueries({ queryKey: ['shows'] });
    setTimeout(() => navigate('/shows'), 100);
  };

  function handleRegisterForShow(): void {
    if (showId) {
      navigate(`/shows/${showId}/register`);
    }
  }

  // Breadcrumbs for PageHeader
  const breadcrumbs = useMemo(
    () => [
      { label: 'Shows', href: '/shows' },
      { label: actualCurrentShow?.name || 'Show Details', href: `/shows/${id}` },
    ],
    [actualCurrentShow?.name, id]
  );

  // Tab definitions for PrimaryTabs (must be before early returns — rules of hooks)
  const tabDefs: PrimaryTabDef[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'trials', label: 'Trials', icon: Trophy, count: associatedTrials.length },
      { id: 'classes', label: 'Classes', icon: ListChecks, count: showClasses.length },
      ...(isAuthenticated
        ? [
            { id: 'my-entries', label: 'Entries', icon: ClipboardList, count: userEntries.length },
            { id: 'my-stats', label: 'My Stats', icon: BarChart3 },
          ]
        : []),
      { id: 'results', label: 'Results', icon: Medal, count: 0 },
    ],
    [isAuthenticated, associatedTrials.length, showClasses.length, userEntries.length]
  );

  // Loading state
  if (fastLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} />
      </PageShell>
    );
  }

  // Error state — fetch failed
  if (fastError) {
    return (
      <PageShell>
        <ErrorState message="We couldn't load this show. Please try again." onRetry={refetchShow} />
      </PageShell>
    );
  }

  // Not found / no data
  if (!actualCurrentShow) {
    return (
      <PageShell>
        <NotFoundState entityName="Show" backTo="/shows" backLabel="Back to Shows" />
      </PageShell>
    );
  }

  const publicLandingShow =
    actualCurrentShow.experienceIsPublished && actualCurrentShow.experiencePublishedStyle
      ? { ...actualCurrentShow, style: actualCurrentShow.experiencePublishedStyle }
      : actualCurrentShow;

  // Heritage public landing — renders for any visitor who is not staff.
  // Staff (secretary / admin / club_admin) always reach the management UI.
  if (
    getShowStyle(publicLandingShow) === 'heritage' &&
    !isSecretary &&
    !isAdmin &&
    !hasRole('club_admin')
  ) {
    return (
      <HeritageLandingPage
        show={publicLandingShow}
        trial={associatedTrials[0] ?? null}
        allTrials={associatedTrials}
      />
    );
  }

  const entryStatus = getEntryStatus(actualCurrentShow, hasUserEntries);

  return (
    <>
      <PageShell>
        <PageHeader
          breadcrumbs={breadcrumbs}
          title={actualCurrentShow.name || 'Show Details'}
          actions={
            (armbandCount ?? 0) > 0 && actualCurrentShow?.id ? (
              <ArmbandLookup showId={actualCurrentShow.id} />
            ) : undefined
          }
        />

        <DetailHero
          eyebrow={
            actualCurrentShow.startDate && actualCurrentShow.endDate
              ? formatDateRange(actualCurrentShow.startDate, actualCurrentShow.endDate, 'short')
              : undefined
          }
          cover={
            actualCurrentShow.startDate ? (
              <ShowDateBlock
                startDate={actualCurrentShow.startDate}
                endDate={actualCurrentShow.endDate}
              />
            ) : undefined
          }
          name={actualCurrentShow.name || 'Untitled Show'}
          subtitle={actualCurrentShow.clubName || undefined}
          badges={[
            ...(actualCurrentShow.organization
              ? [{ label: actualCurrentShow.organization, variant: 'default' as const }]
              : []),
            ...(!canManageShow
              ? [
                  {
                    label: entryStatus.label,
                    variant: ENTRY_STATUS_HERO_VARIANT[entryStatus.status],
                  },
                ]
              : []),
          ]}
          metadata={[]}
          closedMessage={
            !canManageShow && !entryStatus.canEnter ? entryStatus.description : undefined
          }
          {...(!canManageShow
            ? entryStatus.canEnter
              ? {
                  primaryAction: {
                    label: hasUserEntries ? 'Manage Entry' : 'Enter This Show',
                    onClick: handleRegisterForShow,
                  },
                }
              : hasUserEntries
                ? { primaryAction: { label: 'View Entry', onClick: handleRegisterForShow } }
                : {}
            : {})}
          secondaryActions={
            canManageShow && (
              <div className="flex items-center gap-1">
                <ShowStatusPill showId={actualCurrentShow.id} status={actualCurrentShow.status} />
                <Button variant="outline" size="sm" onClick={() => setShowEditPanel(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <ThreeDotMenu
                  items={[
                    {
                      label: 'Delete Show',
                      icon: <Trash2 className="h-4 w-4" />,
                      onClick: () => setShowDeleteDialog(true),
                      className: 'text-destructive',
                    },
                  ]}
                />
              </div>
            )
          }
          footer={<QuickInfoCards show={actualCurrentShow} />}
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PremiumDownloadCard showId={actualCurrentShow.id} showStaleBadge={canManageShow} />
          <LandingPageCard
            showId={actualCurrentShow.id}
            showStyle={getShowStyle(actualCurrentShow)}
          />
        </div>

        <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setTab}>
          <TabsContent value="overview">
            <ShowOverviewTab
              show={actualCurrentShow}
              canManageShow={canManageShow}
              judges={effectiveJudges}
            />
          </TabsContent>

          <TabsContent value="trials">
            <TrialsTab
              trials={associatedTrials}
              showId={actualCurrentShow.id}
              trialStats={trialStats}
            />
          </TabsContent>

          <TabsContent value="classes">
            <ClassesTab
              classes={showClasses}
              showId={actualCurrentShow.id}
              userHasEntries={hasUserEntries}
              hideRing={associatedTrials.some(
                t =>
                  t.trialType === 'Scent Work' ||
                  t.trialType === 'Nosework' ||
                  t.trialType === 'Scent Detection'
              )}
            />
          </TabsContent>

          {isAuthenticated && (
            <TabsContent value="my-entries">
              <MyEntriesTab showId={actualCurrentShow.id} />
            </TabsContent>
          )}

          {isAuthenticated && (
            <TabsContent value="my-stats">
              <MyShowStatsTab showId={actualCurrentShow.id} />
            </TabsContent>
          )}

          <TabsContent value="results">
            <ShowResultsTab showId={actualCurrentShow.id} />
          </TabsContent>
        </PrimaryTabs>
      </PageShell>

      {/* Dialogs */}
      <ShowEditPanel
        open={showEditPanel}
        onClose={() => setShowEditPanel(false)}
        showId={actualCurrentShow.id || ''}
        showName={actualCurrentShow.name || ''}
        initialShowData={actualCurrentShow || {}}
        onSave={async showData => {
          if (actualCurrentShow.id) {
            const showId = actualCurrentShow.id;
            const publishableShowData = showData as Partial<ShowInput> & {
              publishExperience?: boolean;
              generatedPremium?: GeneratedPremium;
              inkSaver?: boolean;
            };
            const localShow = await updateShowLocally(showId, showData as Partial<ShowInput>);
            if (!localShow) {
              throw new Error('Show was not available in the local store.');
            }
            queryClient.setQueryData<Show>(showQueryKeys.detail(showId), localShow);
            queryClient.setQueryData<Show[]>(showQueryKeys.lists(), current =>
              current?.map(show => (show.id === showId ? localShow : show))
            );

            // Persist judge assignments to judge_assignments table
            await persistShowJudgeAssignments(showId, showData.assignedJudges || []);

            if (publishableShowData.publishExperience && publishableShowData.generatedPremium) {
              await publishExperience({
                showId,
                premium: applyShowFormDataToPremium(
                  publishableShowData.generatedPremium,
                  showData as Partial<ShowInput>
                ),
                inkSaver: Boolean(publishableShowData.inkSaver),
              });
              queryClient.invalidateQueries({ queryKey: ['shows', showId, 'publish-info'] });
              queryClient.invalidateQueries({
                queryKey: ['shows', showId, 'published-experience-content'],
              });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
              queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
            }

          }
          setShowEditPanel(false);
        }}
      />
      {showDeleteDialog && showId && actualCurrentShow && (
        <DeleteShowDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          showId={showId}
          onDelete={handleConfirmDelete}
          showName={actualCurrentShow.name || 'Unknown Show'}
        />
      )}
    </>
  );
};

export default ShowDetailsPage;
