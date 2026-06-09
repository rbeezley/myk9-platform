import { useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { getShowStyle } from '@/features/registries';
import { SetupAdaptiveHeader } from '@/features/show-workbench/SetupAdaptiveHeader';
import { SetupPublishSection } from '@/features/show-workbench/SetupPublishSection';
import { computeSetupReadinessSignals } from '@/features/show-workbench/setupReadinessSignals';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';

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

export function ShowWorkbenchSetupPage() {
  const { showId } = useParams<{ showId: string }>();
  const { show: currentShow, isLoading } = useFastShowDetails(showId);
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

  useEffect(() => {
    if (!showId) return;
    void loadTrials();
    void loadTrialClasses();
  }, [showId, loadTrials, loadTrialClasses]);

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

  if (isLoading || !currentShow) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  return (
    <>
      <PhaseShell title="Setup" kicker="Before the show" />
      <div className="space-y-6">
        <SetupAdaptiveHeader signals={setupSignals} />
        <SetupPublishSection showId={currentShow.id} showStyle={getShowStyle(currentShow)} />
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
    </>
  );
}
