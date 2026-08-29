import { lazy, Suspense, useMemo } from 'react';
import { FileBarChart, ListChecks, Send } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { ShowAccessCodesCard } from '@/components/secretary/ShowAccessCodesCard';
import { JudgeHospitalityCard } from '@/features/show-workbench/JudgeHospitalityCard';
import { IncidentLogCard } from '@/features/show-workbench/IncidentLogCard';
import { EmergencyTrialPacketTool } from '@/features/emergency-trial-packet/EmergencyTrialPacketTool';
import { SecretaryAddEntriesDecision } from '@/features/registration/SecretaryAddEntriesDecision';
import { ScheduleSlipScriptCard } from '@/features/show-workbench/ScheduleSlipScriptCard';
import { TasksNotesCard } from '@/features/show-workbench/TasksNotesCard';
import { VolunteersCard } from '@/features/show-workbench/VolunteersCard';
import { WorkbenchLateEntryAction } from '@/features/show-workbench/WorkbenchLateEntryAction';
import { ShowCloseoutSummary } from '@/features/show-workbench/ShowCloseoutSummary';
import { CloseOutShowAction } from '@/features/show-workbench/CloseOutShowAction';
import {
  toCloseoutClassSummary,
  type CloseoutTrialSummary,
} from '@/features/show-workbench/showCloseOutShow';
import { ShowDeskPeopleRoster } from '@/features/show-desk-people-roster/ShowDeskPeopleRoster';
import { SelfCheckinTool } from '@/features/show-workbench/SelfCheckinTool';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { useQuery } from '@tanstack/react-query';
import {
  listShowIncidentCloseout,
  showIncidentCloseoutQueryKey,
} from '@/services/database/show-incidents';
import { summarizeShowIncidents } from '@/features/show-workbench/showIncidents';
import { useJudgeHospitalityReminderCount } from '@/features/show-workbench/useJudgeHospitalityReminderCount';
import { useSecretaryTasks } from '@/hooks/queries/useSecretaryTasks';
import type { SecretaryTask } from '@/pages/secretary/SecretaryDashboardPage/types';
import { computeShowDeskActionable } from '@/features/show-map/showDeskActionable';
import type { ShowDeskToolSection } from '@/features/show-map/ShowDeskToolsSheet';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import {
  EMPTY_ENTRIES,
  getShowDeskEntriesAvailability,
  tallyEntriesByClass,
} from './showDeskEntryAvailability';
import { ShowDeskEntriesUnavailable } from './ShowDeskEntriesUnavailable';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import type { ShowMapEntryInput } from '@/features/show-map/showMapTypes';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { isValidUUID } from '@/utils/validation';
import type { IncidentEntryOption } from '@/features/show-workbench/showIncidents';
import {
  ShowDeskScheduleRefreshWarning,
  ShowDeskScheduleUnavailable,
} from './ShowDeskScheduleReadState';
import { useShowDeskScheduleRead } from './useShowDeskScheduleRead';
import { toIncidentEntryOption } from './showDeskIncidentEntryOptions';

/** Stable identities so a missing read does not remint an array each render. */
const EMPTY_INCIDENTS: Awaited<ReturnType<typeof listShowIncidentCloseout>> = [];
const EMPTY_TASKS: SecretaryTask[] = [];

const ShowDeskPanel = lazy(() => import('@/features/show-map/ShowDeskPanel'));

export function ShowWorkbenchShowDeskPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show: currentShow, isLoading } = useFastShowDetails(showId);
  const {
    trials,
    trialClasses,
    hasConfirmedSnapshot: scheduleHasConfirmedSnapshot,
    readFailed: scheduleReadFailed,
    readPending: scheduleReadPending,
    retry: retrySchedule,
  } = useShowDeskScheduleRead();
  const {
    data: showEntriesData,
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
    error: showEntriesError,
    refetch: refetchShowEntries,
  } = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId));
  const showEntries = useMemo(() => showEntriesData ?? EMPTY_ENTRIES, [showEntriesData]);
  const { entriesKnown, entriesUnavailable } = getShowDeskEntriesAvailability({
    data: showEntriesData,
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
    isEnabled: Boolean(showId),
  });
  const showMapEntries = showEntries as unknown as ShowMapEntryInput[];
  const reconciliationEntries = showEntries as unknown as ShowDayReconciliationEntry[];
  const { data: showJudgeRoster = [] } = useShowJudges(showId);
  const { data: resultSubmissions = [] } = useResultSubmissions(showId || '');

  const entryTallies = useMemo(() => tallyEntriesByClass(showEntries), [showEntries]);

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
          revisedExpectedStart: cls.revisedExpectedStart ?? null,
          actualStartTime: cls.actualStartTime,
          actualFinishTime: cls.actualFinishTime,
          displayOrder: cls.displayOrder,
          status: cls.status || CLASS_STATUS.SCHEDULED,
          entryCount: entriesKnown ? (entryTallies.get(cls.id)?.total ?? 0) : null,
          scoredCount: entriesKnown ? (entryTallies.get(cls.id)?.scored ?? 0) : null,
          trialDate: trial.trialDate || '',
          timezone: trial.timezone ?? null,
          trialNumber: trial.trialNumber || '',
          trialName: trial.name || '',
        }));
      }),
    [associatedTrials, entriesKnown, entryTallies, trialClasses]
  );
  const closeoutClasses = useMemo(() => showClasses.map(toCloseoutClassSummary), [showClasses]);
  const closeoutTrials = useMemo<CloseoutTrialSummary[]>(
    () =>
      associatedTrials.map(trial => ({
        id: trial.id,
        status: trial.status,
      })),
    [associatedTrials]
  );

  const showMapTrials = useMemo(() => {
    // Both an emailed submission (`sent`) and a manually-recorded one
    // (`submitted`, filed through the org's portal) mean results are in to the
    // org — count either as "submitted" for the show-map readiness stamp.
    const sentSubmissions = resultSubmissions.filter(
      row => row.status === 'sent' || row.status === 'submitted'
    );
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

  // Stable id/name list shared by the hospitality card content and the
  // reminder-count hook so the trigger badge and the card never disagree.
  const hospitalityJudges = useMemo(
    () => effectiveJudges.map(judge => ({ id: judge.judgeId, name: judge.judgeName })),
    [effectiveJudges]
  );

  const incidentEntryOptions = useMemo(() => {
    const classById = new Map(showClasses.map(cls => [cls.id, cls]));
    return showMapEntries
      .map(entry => toIncidentEntryOption(entry, classById))
      .filter((entry): entry is IncidentEntryOption => entry !== null);
  }, [showClasses, showMapEntries]);

  // INTENT: Urgent or reportable incidents surface themselves on the tools
  // sheet (attentionLabel auto-opens the section) instead of waiting silently
  // behind the wrench icon while the secretary handles a crisis.
  const { data: closeoutIncidentsData } = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId ?? ''),
    queryFn: () => listShowIncidentCloseout(showId ?? ''),
    enabled: Boolean(showId),
  });
  const closeoutIncidents = useMemo(
    () => closeoutIncidentsData ?? EMPTY_INCIDENTS,
    [closeoutIncidentsData]
  );
  const incidentsKnown = closeoutIncidentsData !== undefined;
  const incidentSummary = useMemo(
    () => summarizeShowIncidents(closeoutIncidents),
    [closeoutIncidents]
  );
  const incidentAttentionLabel = useMemo(() => {
    if (incidentSummary.urgentCount > 0) {
      return `${incidentSummary.urgentCount} urgent`;
    }
    if (incidentSummary.reportableCount > 0) {
      return `${incidentSummary.reportableCount} reportable`;
    }
    return undefined;
  }, [incidentSummary]);

  // Aggregate every attention-worthy tool into one ambient signal for the
  // closed Tools trigger badge. Without this, hospitality reminders and open
  // tasks were invisible until the secretary opened the wrench. Tasks share the
  // React Query cache with TasksNotesCard; hospitality reads the same
  // localStorage the card writes (kept live via useJudgeHospitalityReminderCount).
  const hospitalityReminderCount = useJudgeHospitalityReminderCount(
    showId ?? '',
    hospitalityJudges
  );
  const { data: showTasksData } = useSecretaryTasks(showId);
  const showTasks = useMemo(() => showTasksData ?? EMPTY_TASKS, [showTasksData]);
  /**
   * `null` when the tasks read did not succeed. Both this and the incident
   * count feed the closed Tools badge, which is the secretary's only "is
   * anything waiting?" glance -- so an unread source has to withhold the
   * count rather than contribute a zero to it.
   */
  const tasksOpenCount = useMemo(
    () =>
      showTasksData === undefined
        ? null
        : showTasks.filter((task: SecretaryTask) => task.status === 'todo').length,
    [showTasks, showTasksData]
  );
  const actionable = useMemo(
    () =>
      computeShowDeskActionable({
        incidentReportableCount: incidentsKnown ? incidentSummary.reportableCount : null,
        hospitalityReminderCount,
        tasksOpenCount,
      }),
    [hospitalityReminderCount, incidentsKnown, incidentSummary.reportableCount, tasksOpenCount]
  );

  const showDeskTools = useMemo<ShowDeskToolSection[]>(() => {
    if (!currentShow) return [];

    return [
      {
        id: 'people-at-show',
        title: 'People at show',
        summary: 'Look up exhibitors, armbands, class entries, and check-in status',
        layout: 'wide',
        content: (
          <ShowDeskPeopleRoster
            showId={currentShow.id}
            classes={showClasses}
            entries={showEntries}
            isLoading={showEntriesLoading}
            loadError={showEntriesError}
            onRetry={() => void refetchShowEntries()}
          />
        ),
      },
      {
        id: 'self-checkin',
        title: 'Self check-in',
        summary: 'Control exhibitor self check-in by show, trial, or class',
        layout: 'wide',
        content: (
          <SelfCheckinTool
            showId={currentShow.id}
            trials={associatedTrials}
            classes={showClasses.map(cls => ({
              id: cls.id,
              trialId: cls.trialId,
              element: cls.element,
              level: cls.level,
              section: cls.section,
            }))}
          />
        ),
      },
      {
        id: 'add-entries',
        title: 'Add entries',
        summary: 'Choose own, paper, or late entries without leaving Show Desk',
        defaultOpen: true,
        content: (
          <div className="flex flex-col gap-3">
            <SecretaryAddEntriesDecision showId={currentShow.id} />
            <WorkbenchLateEntryAction showId={currentShow.id} />
          </div>
        ),
      },
      {
        id: 'emergency-trial-packet',
        title: 'Emergency trial packet',
        summary: 'Prepare or confirm the printed paper fallback for this show',
        layout: 'wide',
        content: <EmergencyTrialPacketTool show={currentShow} />,
      },
      {
        id: 'judge-hospitality',
        title: 'Judge hospitality',
        summary: 'Track judge meals, breaks, and show-day notes',
        content: <JudgeHospitalityCard showId={currentShow.id} judges={hospitalityJudges} />,
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
        title: 'Schedule slip script',
        summary: 'Draft calm wording for schedule changes',
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
            canLoadCodes
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
      {
        id: 'show-closeout',
        title: 'Show closeout',
        summary: 'Verify final work and close the Show',
        layout: 'wide',
        content: (
          <div className="space-y-4">
            <ShowCloseoutSummary showId={currentShow.id} entries={reconciliationEntries} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/results-control`}>
                  <ListChecks className="h-5 w-5" />
                  <span className="text-left">Results</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/reports`}>
                  <FileBarChart className="h-5 w-5" />
                  <span className="text-left">Reports</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 p-4">
                <Link to={`/shows/${currentShow.id}/submit-results`}>
                  <Send className="h-5 w-5" />
                  <span className="text-left">Submit results</span>
                </Link>
              </Button>
            </div>
            <CloseOutShowAction
              show={{ id: currentShow.id, status: currentShow.status }}
              trials={closeoutTrials}
              classes={closeoutClasses}
              entries={reconciliationEntries}
              incidents={incidentSummary}
              submissions={resultSubmissions}
            />
          </div>
        ),
      },
    ];
  }, [
    associatedTrials,
    currentShow,
    closeoutClasses,
    closeoutTrials,
    effectiveJudges,
    hospitalityJudges,
    incidentAttentionLabel,
    incidentEntryOptions,
    incidentSummary,
    reconciliationEntries,
    refetchShowEntries,
    resultSubmissions,
    showClasses,
    showEntries,
    showEntriesError,
    showEntriesLoading,
  ]);

  if (isLoading || !currentShow) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (showEntriesLoading) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (!scheduleHasConfirmedSnapshot && (scheduleReadFailed || scheduleReadPending)) {
    return (
      <ShowDeskScheduleUnavailable
        hasConfirmedSnapshot={scheduleHasConfirmedSnapshot}
        readFailed={scheduleReadFailed}
        readPending={scheduleReadPending}
        onRetry={() => void retrySchedule()}
      />
    );
  }

  // Settled, no data, no error: the read never happened (paused offline, or
  // disabled). Everything below derives from `showEntries`, so rendering the
  // desk here would state a zero it never read -- the exact thing the copy in
  // both these branches promises not to do.
  if (showEntriesIsError && showEntries.length === 0) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Couldn't load show entries.</p>
        <p className="mt-1 text-muted-foreground">
          Entry counts, People at show, Show Map, and closeout are paused so they do not show a
          false zero-entry state.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void refetchShowEntries()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
      <ShowDeskScheduleRefreshWarning
        hasConfirmedSnapshot={scheduleHasConfirmedSnapshot}
        readFailed={scheduleReadFailed}
        onRetry={() => void retrySchedule()}
      />
      {entriesUnavailable && (
        <ShowDeskEntriesUnavailable onRetry={() => void refetchShowEntries()} />
      )}
      <ShowDeskPanel
        show={currentShow}
        trials={showMapTrials}
        classes={showClasses}
        entries={showMapEntries}
        canManageShow
        tools={showDeskTools}
        actionableCount={actionable.count}
        actionableTone={actionable.tone}
        actionableIncomplete={actionable.incomplete}
      />
    </Suspense>
  );
}
