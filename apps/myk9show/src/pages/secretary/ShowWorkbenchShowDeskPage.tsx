import { lazy, Suspense, useMemo } from 'react';
import {
  FileBarChart,
  ListChecks,
  Send,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useEntriesByShowQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { JudgeHospitalityCard } from '@/features/show-workbench/JudgeHospitalityCard';
import { IncidentLogCard } from '@/features/show-workbench/IncidentLogCard';
import { ScheduleSlipScriptCard } from '@/features/show-workbench/ScheduleSlipScriptCard';
import { TasksNotesCard } from '@/features/show-workbench/TasksNotesCard';
import { VolunteersCard } from '@/features/show-workbench/VolunteersCard';
import { WorkbenchLateEntryAction } from '@/features/show-workbench/WorkbenchLateEntryAction';
import { ShowDayReconciliation } from '@/features/show-workbench/ShowDayReconciliation';
import { IncidentCloseoutSummary } from '@/features/show-workbench/IncidentCloseoutSummary';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { useQuery } from '@tanstack/react-query';
import {
  listShowIncidentCloseout,
  showIncidentCloseoutQueryKey,
} from '@/services/database/show-incidents';
import { summarizeShowIncidents } from '@/features/show-workbench/showIncidents';
import type { ShowDeskToolSection } from '@/features/show-map/ShowDeskToolsSheet';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { isValidUUID } from '@/utils/validation';
import type { IncidentEntryOption } from '@/features/show-workbench/showIncidents';

const ShowDeskPanel = lazy(() => import('@/features/show-map/ShowDeskPanel'));

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

export function ShowWorkbenchShowDeskPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show: currentShow, isLoading } = useFastShowDetails(showId);
  const { trials, trialClasses } = useTrialStore(
    useShallow(s => ({ trials: s.trials, trialClasses: s.trialClasses }))
  );
  const { data: showEntries = [] } = useEntriesByShowQuery(showId || '', !!showId);
  const { data: showJudgeRoster = [] } = useShowJudges(showId);
  const { data: resultSubmissions = [] } = useResultSubmissions(showId || '');

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

  const showMapTrials = useMemo(() => {
    const sentSubmissions = resultSubmissions.filter(row => row.status === 'sent');
    const showSubmittedAt = sentSubmissions.find(row => !row.trial_id)?.submitted_at;

    return associatedTrials.map(trial => ({
      ...trial,
      resultSubmittedAt:
        sentSubmissions.find(row => row.trial_id === trial.id)?.submitted_at ?? showSubmittedAt,
    }));
  }, [associatedTrials, resultSubmissions]);

  const effectiveJudges = useMemo(
    () =>
      resolveOverviewJudgesWithRoster(currentShow?.assignedJudges, showJudgeRoster, showClasses),
    [currentShow?.assignedJudges, showClasses, showJudgeRoster]
  );

  const incidentEntryOptions = useMemo(() => {
    const classById = new Map(showClasses.map(cls => [cls.id, cls]));
    return showEntries
      .map(entry => toIncidentEntryOption(entry, classById))
      .filter((entry): entry is IncidentEntryOption => entry !== null);
  }, [showClasses, showEntries]);

  // INTENT: Urgent or reportable incidents surface themselves on the tools
  // sheet (attentionLabel auto-opens the section) instead of waiting silently
  // behind the wrench icon while the secretary handles a crisis.
  const { data: closeoutIncidents = [] } = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId ?? ''),
    queryFn: () => listShowIncidentCloseout(showId ?? ''),
    enabled: Boolean(showId),
  });
  const incidentAttentionLabel = useMemo(() => {
    const summary = summarizeShowIncidents(closeoutIncidents);
    if (summary.urgentCount > 0) {
      return `${summary.urgentCount} urgent`;
    }
    if (summary.reportableCount > 0) {
      return `${summary.reportableCount} reportable`;
    }
    return undefined;
  }, [closeoutIncidents]);

  const showDeskTools = useMemo<ShowDeskToolSection[]>(() => {
    if (!currentShow) return [];

    return [
      {
        id: 'late-entry',
        title: 'Late entries',
        summary: 'Add a day-of entry without leaving Show Desk',
        defaultOpen: true,
        content: <WorkbenchLateEntryAction showId={currentShow.id} />,
      },
      {
        id: 'judge-hospitality',
        title: 'Judge hospitality',
        summary: 'Track judge meals, breaks, and show-day notes',
        content: (
          <JudgeHospitalityCard
            showId={currentShow.id}
            judges={effectiveJudges.map(judge => ({
              id: judge.judgeId,
              name: judge.judgeName,
            }))}
          />
        ),
      },
      {
        id: 'incident-log',
        title: 'Incident log',
        summary: 'Record incidents while details are fresh',
        ...(incidentAttentionLabel !== undefined && {
          attentionLabel: incidentAttentionLabel,
        }),
        content: (
          <IncidentLogCard
            showId={currentShow.id}
            entries={incidentEntryOptions}
            judges={effectiveJudges.map(judge => ({
              id: judge.judgeId,
              name: judge.judgeName,
              personId: isValidUUID(judge.judgeId.trim()) ? judge.judgeId.trim() : null,
            }))}
          />
        ),
      },
      {
        id: 'schedule-slip',
        title: 'Delay scripts',
        summary: 'Draft calm wording for schedule slips',
        content: (
          <ScheduleSlipScriptCard
            showId={currentShow.id}
            showName={currentShow.name}
            defaultClassName={showClasses[0]?.name ?? ''}
          />
        ),
      },
      {
        id: 'access-codes',
        title: 'Access codes',
        summary: 'Share judge and ringside entry codes',
        content: (
          <ShowAccessCodesCard
            showId={currentShow.id}
            showName={currentShow.name}
            showDate={currentShow.startDate}
            canRegenerate
          />
        ),
      },
      {
        id: 'volunteers',
        title: 'Volunteers',
        summary: 'Track helper assignments and gaps',
        content: <VolunteersCard showId={currentShow.id} />,
      },
      {
        id: 'tasks-notes',
        title: 'Tasks and notes',
        summary: 'Keep show-specific reminders together',
        content: <TasksNotesCard showId={currentShow.id} clubId={currentShow.clubId} />,
      },
    ];
  }, [currentShow, effectiveJudges, incidentAttentionLabel, incidentEntryOptions, showClasses]);

  if (isLoading || !currentShow) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
      <ShowDeskPanel
        show={currentShow}
        trials={showMapTrials}
        classes={showClasses}
        entries={showEntries}
        canManageShow
        tools={showDeskTools}
        closeoutContent={
          <>
            <ShowDayReconciliation entries={showEntries} />
            <IncidentCloseoutSummary showId={currentShow.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/results-control`}>
                  <ListChecks className="h-5 w-5" />
                  <span className="text-left">
                    <span className="block font-medium">Results Control</span>
                    <span className="block text-xs text-muted-foreground">Verify results</span>
                  </span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/reports`}>
                  <FileBarChart className="h-5 w-5" />
                  <span className="text-left">
                    <span className="block font-medium">Reports</span>
                    <span className="block text-xs text-muted-foreground">Print and export</span>
                  </span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/submit-results`}>
                  <Send className="h-5 w-5" />
                  <span className="text-left">
                    <span className="block font-medium">Submit Results</span>
                    <span className="block text-xs text-muted-foreground">Send final files</span>
                  </span>
                </Link>
              </Button>
            </div>
          </>
        }
      />
    </Suspense>
  );
}
