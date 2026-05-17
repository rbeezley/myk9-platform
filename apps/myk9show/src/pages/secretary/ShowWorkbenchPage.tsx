import { lazy, Suspense, useEffect, useMemo } from 'react';
import { ClipboardCheck, ListChecks, Medal, Pencil } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { DetailHero } from '@/components/common/DetailHero';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
import {
  PrimaryTabs,
  PrimaryTabsContent,
  type PrimaryTabDef,
} from '@/components/common/PrimaryTabs';
import { QuickInfoCards } from '@/components/shows/overview/QuickInfoCards';
import { ShowDateBlock } from '@/components/shows/ShowDateBlock';
import { ShowStatusPill } from '@/components/shows/ShowStatusPill';
import { MyK9QAccessCard } from '@/components/secretary/MyK9QAccessCard';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { LandingPageCard } from '@/features/premium/LandingPageCard';
import { PremiumDownloadCard } from '@/features/premium/PremiumDownloadCard';
import { getShowStyle } from '@/features/registries';
import { isShowWorkbenchPhase, useActivePhase } from '@/hooks/useActivePhase';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';

const ShowMapTab = lazy(() => import('@/features/show-map/ShowMapTab'));

const PHASE_TABS: PrimaryTabDef[] = [
  { id: 'setup', label: 'Setup', icon: ListChecks },
  { id: 'today', label: 'Today', icon: ClipboardCheck },
  { id: 'wrap-up', label: 'Wrap-up', icon: Medal },
];

function PhaseShell({ title, kicker }: { title: string; kicker: string }) {
  return (
    <section className="space-y-3 pt-6" aria-label={title}>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{kicker}</p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    </section>
  );
}

export function ShowWorkbenchPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const [activePhase, setActivePhase] = useActivePhase();
  const { show: currentShow, isLoading, isError, refetch } = useFastShowDetails(showId);
  const trials = useTrialStore(s => s.trials);
  const trialClasses = useTrialStore(s => s.trialClasses);
  const loadTrials = useTrialStore(s => s.loadTrials);
  const loadTrialClasses = useTrialStore(s => s.loadTrialClasses);
  const { data: showEntries = [] } = useEntriesByShowQuery(showId || '', !!showId);
  const { data: showJudgeRoster = [] } = useShowJudges(showId);

  useEffect(() => {
    if (!showId) return;
    void loadTrials();
    void loadTrialClasses();
  }, [showId, loadTrials, loadTrialClasses]);

  const breadcrumbs = useMemo(
    () => [
      { label: 'Secretary', href: '/secretary/dashboard' },
      {
        label: currentShow?.name || 'Show Workbench',
        href: showId ? `/secretary/shows/${showId}` : '/secretary/dashboard',
      },
    ],
    [currentShow?.name, showId]
  );

  const associatedTrials = useMemo(
    () =>
      showId
        ? trials
            .filter(trial => trial.showId === showId)
            .sort((a, b) => {
              const orderA = a.order ? parseInt(a.order, 10) : Infinity;
              const orderB = b.order ? parseInt(b.order, 10) : Infinity;
              if (orderA !== orderB) return orderA - orderB;
              return (a.trialDate || '').localeCompare(b.trialDate || '');
            })
        : [],
    [showId, trials]
  );

  const showClasses = useMemo(
    () =>
      associatedTrials.flatMap(trial => {
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
          entryCount: showEntries.filter(entry => entry.class_id === cls.id).length,
          scoredCount: cls.completedEntries ?? 0,
          trialDate: trial.trialDate || '',
          trialNumber: trial.trialNumber || '',
          trialName: trial.name || '',
        }));
      }),
    [associatedTrials, showEntries, trialClasses]
  );

  const effectiveJudges = useMemo(
    () =>
      resolveOverviewJudgesWithRoster(currentShow?.assignedJudges, showJudgeRoster, showClasses),
    [currentShow?.assignedJudges, showClasses, showJudgeRoster]
  );

  if (isLoading) {
    return (
      <PageShell>
        <LoadingSkeleton variant="cards" count={3} />
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <ErrorState
          message="We couldn't load this show workbench."
          onRetry={() => {
            void refetch?.();
          }}
        />
      </PageShell>
    );
  }

  if (!currentShow) {
    return (
      <PageShell>
        <NotFoundState
          entityName="Show"
          backTo="/secretary/dashboard"
          backLabel="Back to Dashboard"
        />
      </PageShell>
    );
  }

  function handlePhaseChange(value: string) {
    if (isShowWorkbenchPhase(value)) {
      setActivePhase(value);
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={`${currentShow.name || 'Show'} workbench`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/shows/${currentShow.id}?edit=true`)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        }
      />

      <DetailHero
        cover={
          currentShow.startDate ? (
            <ShowDateBlock startDate={currentShow.startDate} endDate={currentShow.endDate} />
          ) : undefined
        }
        name={currentShow.name || 'Untitled Show'}
        subtitle={currentShow.clubName || undefined}
        badges={
          currentShow.organization
            ? [{ label: currentShow.organization, variant: 'default' as const }]
            : []
        }
        secondaryActions={<ShowStatusPill showId={currentShow.id} status={currentShow.status} />}
        footer={<QuickInfoCards show={currentShow} />}
      />

      <PrimaryTabs tabs={PHASE_TABS} value={activePhase} onValueChange={handlePhaseChange}>
        <PrimaryTabsContent value="setup">
          <PhaseShell title="Setup" kicker="Before the show" />
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PremiumDownloadCard showId={currentShow.id} showStaleBadge />
              <LandingPageCard showId={currentShow.id} showStyle={getShowStyle(currentShow)} />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,340px]">
              <div className="space-y-6">
                <ScheduleSummary showId={currentShow.id} />
                <VenueMap location={currentShow.location} />
              </div>
              <div className="space-y-6">
                <ShowOfficials showId={currentShow.id} />
                <JudgesList judges={effectiveJudges} />
              </div>
            </div>
          </div>
        </PrimaryTabsContent>
        <PrimaryTabsContent value="today">
          <PhaseShell title="Today" kicker="Live operations" />
          <div className="space-y-4">
            <MyK9QAccessCard
              showId={currentShow.id}
              showName={currentShow.name}
              showDate={currentShow.startDate}
            />
            <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
              <ShowMapTab
                show={currentShow}
                trials={associatedTrials}
                classes={showClasses}
                entries={showEntries}
                canManageShow
              />
            </Suspense>
          </div>
        </PrimaryTabsContent>
        <PrimaryTabsContent value="wrap-up">
          <PhaseShell title="Wrap-up" kicker="After the show" />
        </PrimaryTabsContent>
      </PrimaryTabs>
    </PageShell>
  );
}

export default ShowWorkbenchPage;
