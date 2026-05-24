import { lazy, Suspense, useEffect, useMemo } from 'react';
import {
  Eye,
  FileBarChart,
  ListChecks,
  ListTree,
  Pencil,
  Send,
} from 'lucide-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
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
import { getShowStyle } from '@/features/registries';
import { ShowDayReconciliation } from '@/features/show-workbench/ShowDayReconciliation';
import { ClassBroadcastCard } from '@/features/show-workbench/ClassBroadcastCard';
import { buildClassBroadcastClassLabel } from '@/features/show-workbench/classBroadcast';
import { IncidentCloseoutSummary } from '@/features/show-workbench/IncidentCloseoutSummary';
import { IncidentLogCard } from '@/features/show-workbench/IncidentLogCard';
import { JudgeHospitalityCard } from '@/features/show-workbench/JudgeHospitalityCard';
import { QuickBroadcastCard } from '@/features/show-workbench/QuickBroadcastCard';
import { ScheduleSlipScriptCard } from '@/features/show-workbench/ScheduleSlipScriptCard';
import { SetupAdaptiveHeader } from '@/features/show-workbench/SetupAdaptiveHeader';
import { SetupPublishSection } from '@/features/show-workbench/SetupPublishSection';
import { computeSetupReadinessSignals } from '@/features/show-workbench/setupReadinessSignals';
import { TasksNotesCard } from '@/features/show-workbench/TasksNotesCard';
import { VolunteersCard } from '@/features/show-workbench/VolunteersCard';
import { WorkbenchLateEntryAction } from '@/features/show-workbench/WorkbenchLateEntryAction';
import type { IncidentEntryOption } from '@/features/show-workbench/showIncidents';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import { isShowWorkbenchPhase, useActivePhase } from '@/hooks/useActivePhase';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { isValidUUID } from '@/utils/validation';

const ShowDeskPanel = lazy(() => import('@/features/show-map/ShowDeskPanel'));

const PHASE_TABS: PrimaryTabDef[] = [
  { id: 'setup', label: 'Setup', icon: ListChecks },
  { id: 'show-desk', label: 'Show Desk', icon: ListTree },
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

function textField(source: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function relatedObject(
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toIncidentEntryOption(
  entry: Record<string, unknown>,
  classById: Map<string, ShowWorkbenchClassSummary>
): IncidentEntryOption | null {
  const dog = relatedObject(entry, 'dog');
  const id = textField(entry, 'id');
  if (!id) return null;

  const classId = textField(entry, 'class_id');
  const classSummary = classId ? classById.get(classId) : undefined;
  const dogName = textField(dog, 'call_name') ?? textField(dog, 'name');
  const handlerName = textField(entry, 'handler');
  const armband = textField(entry, 'armband');
  const classLabel = classSummary?.name;
  const label = [
    armband ? `#${armband}` : null,
    dogName ?? 'Unknown dog',
    handlerName ? `(${handlerName})` : null,
    classLabel ? `- ${classLabel}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    classId,
    dogId: textField(entry, 'dog_id') ?? textField(dog, 'id'),
    dogName,
    handlerId: textField(entry, 'handler_id'),
    handlerName,
    id,
    label,
    trialId: classSummary?.trialId ?? null,
  };
}

export function ShowWorkbenchPage() {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const [activePhase, setActivePhase] = useActivePhase();
  const { show: currentShow, isLoading, isError, refetch } = useFastShowDetails(showId);
  const { trials, trialClasses, loadTrials, loadTrialClasses } = useTrialStore(
    useShallow(s => ({
      trials: s.trials,
      trialClasses: s.trialClasses,
      loadTrials: s.loadTrials,
      loadTrialClasses: s.loadTrialClasses,
    }))
  );
  const { data: showEntries = [] } = useEntriesByShowQuery(showId || '', !!showId);
  const { data: showJudgeRoster = [] } = useShowJudges(showId);
  const { data: resultSubmissions = [] } = useResultSubmissions(showId || '');

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

  const showMapTrials = useMemo(() => {
    const sentSubmissions = resultSubmissions.filter(row => row.status === 'sent');
    const showSubmittedAt = sentSubmissions.find(row => !row.trial_id)?.submitted_at;

    return associatedTrials.map(trial => ({
      ...trial,
      resultSubmittedAt:
        sentSubmissions.find(row => row.trial_id === trial.id)?.submitted_at ?? showSubmittedAt,
    }));
  }, [associatedTrials, resultSubmissions]);

  const showClasses = useMemo<ShowWorkbenchClassSummary[]>(
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

  const incidentEntryOptions = useMemo(() => {
    const classById = new Map(showClasses.map(cls => [cls.id, cls]));
    return showEntries
      .map(entry => toIncidentEntryOption(entry, classById))
      .filter((entry): entry is IncidentEntryOption => entry !== null);
  }, [showClasses, showEntries]);

  const setupSignals = useMemo(
    () =>
      currentShow
        ? computeSetupReadinessSignals({
            show: currentShow,
            trials: associatedTrials,
            classes: showClasses,
            judges: showJudgeRoster,
          })
        : [],
    [associatedTrials, currentShow, showClasses, showJudgeRoster]
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
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/shows/${currentShow.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                Preview public page
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/shows/${currentShow.id}?edit=true`)}
            >
              {/* INTENT: full show editing stays on the existing show detail edit panel
                  until the Setup phase owns every edit surface. */}
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
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
            <SetupAdaptiveHeader signals={setupSignals} />
            <SetupPublishSection
              showId={currentShow.id}
              showStyle={getShowStyle(currentShow)}
            />
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
        <PrimaryTabsContent value="show-desk">
          <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
            <ShowDeskPanel
              show={currentShow}
              trials={showMapTrials}
              classes={showClasses}
              entries={showEntries}
              canManageShow
              toolsContent={
                <>
                  <WorkbenchLateEntryAction showId={currentShow.id} />
                  <JudgeHospitalityCard
                    showId={currentShow.id}
                    judges={effectiveJudges.map(judge => ({
                      id: judge.judgeId,
                      name: judge.judgeName,
                    }))}
                  />
                  <QuickBroadcastCard showId={currentShow.id} />
                  <ClassBroadcastCard
                    showId={currentShow.id}
                    classes={showClasses.map(cls => ({
                      id: cls.id,
                      label: buildClassBroadcastClassLabel({
                        name: cls.name,
                        section: cls.section,
                      }),
                      entryCount: cls.entryCount,
                    }))}
                  />
                  <IncidentLogCard
                    showId={currentShow.id}
                    entries={incidentEntryOptions}
                    judges={effectiveJudges.map(judge => ({
                      id: judge.judgeId,
                      name: judge.judgeName,
                      personId: isValidUUID(judge.judgeId.trim()) ? judge.judgeId.trim() : null,
                    }))}
                  />
                  <ScheduleSlipScriptCard
                    showId={currentShow.id}
                    showName={currentShow.name}
                    defaultClassName={showClasses[0]?.name ?? ''}
                  />
                  <MyK9QAccessCard
                    showId={currentShow.id}
                    showName={currentShow.name}
                    showDate={currentShow.startDate}
                  />
                  <VolunteersCard />
                  <TasksNotesCard showId={currentShow.id} />
                </>
              }
              closeoutContent={
                <>
                  <ShowDayReconciliation entries={showEntries} />
                  <IncidentCloseoutSummary showId={currentShow.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                      <Link to="/secretary/results-control">
                        <ListChecks className="h-5 w-5" />
                        <span className="text-left">
                          <span className="block font-medium">Results Control</span>
                          <span className="block text-xs text-muted-foreground">
                            Verify results
                          </span>
                        </span>
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                      <Link to="/secretary/reports">
                        <FileBarChart className="h-5 w-5" />
                        <span className="text-left">
                          <span className="block font-medium">Reports</span>
                          <span className="block text-xs text-muted-foreground">
                            Print and export
                          </span>
                        </span>
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                      <Link to="/secretary/results-submission">
                        <Send className="h-5 w-5" />
                        <span className="text-left">
                          <span className="block font-medium">Submit Results</span>
                          <span className="block text-xs text-muted-foreground">
                            Send final files
                          </span>
                        </span>
                      </Link>
                    </Button>
                  </div>
                </>
              }
            />
          </Suspense>
        </PrimaryTabsContent>
      </PrimaryTabs>
    </PageShell>
  );
}

export default ShowWorkbenchPage;
