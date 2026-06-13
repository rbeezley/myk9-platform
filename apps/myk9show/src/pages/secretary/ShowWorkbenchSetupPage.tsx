import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { ScheduleSummary } from '@/components/shows/overview/ScheduleSummary';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { VenueMap } from '@/components/shows/overview/VenueMap';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { PhaseShell } from '@/features/show-workbench/PhaseShell';
import { SetupAdaptiveHeader } from '@/features/show-workbench/SetupAdaptiveHeader';
import { computeSetupReadinessSignals } from '@/features/show-workbench/setupReadinessSignals';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';

export function ShowWorkbenchSetupPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show: currentShow, isLoading } = useFastShowDetails(showId);
  const { trials, trialClasses } = useTrialStore(
    useShallow(s => ({ trials: s.trials, trialClasses: s.trialClasses }))
  );
  const { data: showEntries = [] } = useEntriesByShowQuery(showId || '', !!showId);
  const { data: showJudgeRoster = [] } = useShowJudges(showId);

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
        {/* The publish cards render once at the show level (above the
            section tabs in ShowDetailsPage); the exhibitor-materials chip
            deep-links up to them via #setup-publish. */}
        <SetupAdaptiveHeader signals={setupSignals} />
        <div className="setup-detail-grid">
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
