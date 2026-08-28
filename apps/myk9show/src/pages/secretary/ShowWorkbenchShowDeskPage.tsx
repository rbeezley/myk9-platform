import { lazy, Suspense, useMemo } from 'react';
import { FileBarChart, ListChecks, Send } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
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
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';
import { CLASS_STATUS } from '@myk9/core';
import type { ShowWorkbenchClassSummary } from '@/features/show-workbench/showWorkbenchTypes';
import type { SecretaryEntry } from '@/services/database/entries';
import type { ShowDayReconciliationEntry } from '@/features/show-workbench/showDayReconciliationSummary';
import type { ShowMapEntryInput } from '@/features/show-map/showMapTypes';
import { resolveOverviewJudgesWithRoster } from '@/components/shows/overview/overviewJudges';
import { isValidUUID } from '@/utils/validation';
import type { IncidentEntryOption } from '@/features/show-workbench/showIncidents';

/** Stable identity so a missing read does not remint the array each render. */
const EMPTY_ENTRIES: SecretaryEntry[] = [];

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
  const {
    data: showEntriesData,
    isLoading: showEntriesLoading,
    isError: showEntriesIsError,
    error: showEntriesError,
    refetch: refetchShowEntries,
  } = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId));
  const showEntries = useMemo(() => showEntriesData ?? EMPTY_ENTRIES, [showEntriesData]);
  /**
   * Did the entries read actually SUCCEED?
   *
   * This page derives every per-class count, every pending signal, the
   * mark-complete guard, People at show, the Show Map and closeout from
   * `showEntries`. An empty array therefore has to mean "this show has no
   * entries" and nothing else -- but React Query hands back `data: undefined`
   * in three settled-looking states, and `= []` turned all three into that
   * claim.
   *
   * The offline one is why this matters on a show-day desk. The query inherits
   * React Query's `'online'` networkMode (App.tsx mounts a bare QueryClient and
   * `optimizeQueryCache` sets no networkMode), so losing wifi PAUSES it:
   * `fetchStatus` becomes 'paused', which makes `isFetching` false, which makes
   * `isLoading` false -- and pending is not error, so `isError` is false too.
   * Both gates below fell straight through, and the desk rendered "0 of 0
   * scored" on classes with 40 entries, with no attention chips at all, reading
   * as fully clear mid-show.
   *
   * The error copy this page already shows says exactly that: the dependent
   * surfaces are "paused so they do not show a false zero-entry state". That
   * guard was right; it was wired to the one state that does not occur.
   */
  const entriesKnown = showEntriesData !== undefined;
  /**
   * Settled with no data and no error: paused offline, or the query disabled.
   * Deliberately NOT keyed on connectivity -- what matters is whether the read
   * produced data, and an online request that never resolves lands here too.
   */
  const entriesUnavailable =
    showEntriesData === undefined && !showEntriesLoading && !showEntriesIsError;
  const showMapEntries = showEntries as unknown as ShowMapEntryInput[];
  const reconciliationEntries = showEntries as unknown as ShowDayReconciliationEntry[];
  const { data: showJudgeRoster = [] } = useShowJudges(showId);
  const { data: resultSubmissions = [] } = useResultSubmissions(showId || '');

  /**
   * Per-class entry tallies in a single pass.
   *
   * This used to be two `showEntries.filter()` scans inside a `.map` over every
   * class, i.e. O(2 x classes x entries) recomputed whenever `showEntries`
   * changed identity -- which realtime invalidation does routinely. At the
   * load-rehearsal shape that is hundreds of thousands of array visits per
   * recompute.
   */
  const entryTallies = useMemo(() => {
    const tallies = new Map<string, { total: number; scored: number }>();
    for (const entry of showEntries) {
      const classId = entry.class_id;
      if (!classId) continue;
      const tally = tallies.get(classId) ?? { total: 0, scored: 0 };
      tally.total += 1;
      if (entry.is_scored === true) tally.scored += 1;
      tallies.set(classId, tally);
    }
    return tallies;
  }, [showEntries]);

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
  const { data: closeoutIncidents = [] } = useQuery({
    queryKey: showIncidentCloseoutQueryKey(showId ?? ''),
    queryFn: () => listShowIncidentCloseout(showId ?? ''),
    enabled: Boolean(showId),
  });
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
  const { data: showTasks = [] } = useSecretaryTasks(showId);
  const tasksOpenCount = useMemo(
    () => showTasks.filter((task: SecretaryTask) => task.status === 'todo').length,
    [showTasks]
  );
  const actionable = useMemo(
    () =>
      computeShowDeskActionable({
        incidentReportableCount: incidentSummary.reportableCount,
        hospitalityReminderCount,
        tasksOpenCount,
      }),
    [hospitalityReminderCount, incidentSummary.reportableCount, tasksOpenCount]
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
                  <span className="text-left">Results visibility</span>
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

  // Settled, no data, no error: the read never happened (paused offline, or
  // disabled). Everything below derives from `showEntries`, so rendering the
  // desk here would state a zero it never read -- the exact thing the copy in
  // both these branches promises not to do.
  if (entriesUnavailable) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="font-medium">Entry data isn&rsquo;t available right now.</p>
        <p className="mt-1 text-muted-foreground">
          Entry counts, People at show, Show Map and closeout are paused so they do not show a
          false zero-entry state. Class times and ring assignments below are unaffected.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={() => void refetchShowEntries()}
        >
          Try again
        </Button>
      </div>
    );
  }

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
      <ShowDeskPanel
        show={currentShow}
        trials={showMapTrials}
        classes={showClasses}
        entries={showMapEntries}
        canManageShow
        tools={showDeskTools}
        actionableCount={actionable.count}
        actionableTone={actionable.tone}
      />
    </Suspense>
  );
}
