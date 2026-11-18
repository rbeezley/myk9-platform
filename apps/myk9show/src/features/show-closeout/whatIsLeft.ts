/**
 * The one calculation of what is left before a show can close (MYK9-1945, phase 1).
 *
 * Pure on purpose: every screen that counts "what is left" adapts its own data into
 * {@link WhatIsLeftInput} and reads this, so the Results tab's finish row and filter counts, the
 * Visibility settings sheet and the close step cannot count one show three ways.
 *
 * A caller passes only what it has. A class fact left `undefined` is "not tracked by this caller":
 * it never counts toward the line that needs it, and a line that none of the passed classes can
 * answer reports `open: null` (unknown), never "nothing left".
 */
import {
  describeEntryRemovals,
  type EntryRemovalCounts,
} from '@/features/payments/pullReconciliation';
import {
  getCloseoutDuties,
  getTrialRegistry,
  getTrialTimezone,
  lastTrialDay,
  resultsDeadlineCoversTrialType,
  resultsDeadlineFor,
  type RegistryId,
} from '@/features/registries';
import {
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from '@/features/show-workbench/showDayReconciliationSummary';
import type { ShowIncidentSummary } from '@/features/show-workbench/showIncidents';
import type { ResultsClassPhase } from '@/features/results-tab/resultsNextAction';
import { matchesResultsStatusFilter } from '@/features/results-tab/resultsNextAction';
import type { ResultsStatusFilterId } from '@/features/results-tab/resultsNextAction';
import { coveredUntil, newestSubmissionAt } from './submissionTimes';
import { buildCloseConcerns, flaggedPullText, type CloseConcern } from './closeConcerns';
import { isCancelledStatus, needsCascade, normalizeCloseoutStatus } from './closeoutStatus';

const SUBMITTED_STATUSES = new Set(['sent', 'submitted']);

export interface WhatIsLeftClass {
  id: string;
  /** Names the class's registry through its trial. */
  trialId?: string | undefined;
  /** The stored status, in any spelling the schedule carries. */
  status?: string | null | undefined;
  /** Dogs the class expects to run. `null` = the count could not be read. */
  expectedCount: number | null;
  /** Of `expectedCount`, those accounted for. `null` = could not be read. */
  scoredCount: number | null;
  /** Entries never accepted. */
  pendingCount?: number | null | undefined;
  /** `results_released_at`. `undefined` = this caller does not track release. */
  releasedAt?: string | null | undefined;
  /** The Results tab's phase for the class. `undefined` = this caller has no print or sign-off facts. */
  phase?: ResultsClassPhase | undefined;
  /** The class owes the judge's sign-off (Results tab only). */
  takesJudgeSignOff?: boolean | undefined;
  judgeSignedOffAt?: string | null | undefined;
}

export interface WhatIsLeftTrial {
  id?: string | null | undefined;
  registry_id?: string | null;
  registryId?: string | null | undefined;
  /** The trial's day (`trials.date`). Absent = the deadline cannot be worked out. */
  trialDate?: string | null | undefined;
  timezone?: string | null | undefined;
  /** The discipline (`trials.trial_type`); the deadline rules cover scent work only. */
  trialType?: string | null | undefined;
  /** A cancelled trial did not happen, so it never sets the results deadline. */
  status?: string | null | undefined;
}

export interface WhatIsLeftInput {
  classes: readonly WhatIsLeftClass[];
  trials: readonly WhatIsLeftTrial[];
  entries: readonly ShowDayReconciliationEntry[];
  /** `null` when the incident log could not be read. */
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'> | null;
  /** `null` when result submissions could not be read. */
  submissions:
    | readonly {
        status?: string | null | undefined;
        organization?: string | null | undefined;
        /** `result_submissions.submitted_at`: when the file went. */
        submitted_at?: string | null | undefined;
      }[]
    | null;
  /** What the score history says since the results file went. `undefined` = this caller does not look. */
  scoreChanges?: ScoreChangeRead | undefined;
  /**
   * Dogs sharing one handler in a class (MYK9-2031), with the classes they sit in.
   * `undefined` = this caller does not look: the line reports unknown.
   */
  handlerClashes?: { count: number; classIds: readonly string[] } | undefined;
}

/**
 * Newest change to a score the results file carries (`entry_score_audit.changed_at`), per class
 * id (MYK9-2078). `loading` and `unreadable` are their own states: neither may read as "no change".
 */
export type ScoreChangeRead =
  | { status: 'loading' }
  | { status: 'unreadable' }
  | { status: 'read'; latestByClass: ReadonlyMap<string, string> };

/** Whether the app-sent results file still matches the scores. */
export type SentFileCheck = 'current' | 'changed' | 'unknown' | 'checking';

export type WhatIsLeftLineKey =
  | 'unknown-counts'
  | 'unscored'
  | 'pending-review'
  | 'handler-clash'
  | 'unreleased'
  | 'to-print'
  | 'judge-sign-off'
  | 'results-submission'
  | 'refund-review'
  | 'flagged-pulls'
  | 'incidents';

export interface WhatIsLeftLine {
  /** Registry duties carry the registry's own key (`akc-results-file`), so lines never collide. */
  key: string;
  kind: WhatIsLeftLineKey;
  label: string;
  /** Items the line counts; `null` when the line is not a count of items. */
  count: number | null;
  /** The classes the line counted, so a link can open exactly them. */
  classIds: readonly string[];
  /** `true` = something left, `false` = nothing left, `null` = this caller cannot say. */
  open: boolean | null;
  registryId?: RegistryId;
  /**
   * A results-submission line only: the `YYYY-MM-DD` the registry wants the results by, counted
   * from the show's last trial day in its own time zone. Absent when the registry has no verified
   * deadline or no trial date was passed.
   */
  deadline?: string;
  /** The sentence the close step shows for the line while it is open or unknown. */
  closeConcern?: string;
  /** An app-sent results file only; absent when nothing was sent or the caller does not look. */
  sentFileCheck?: SentFileCheck;
}

export interface WhatIsLeft {
  unknownCountClassIds: readonly string[];
  unscoredClassIds: readonly string[];
  pendingReviewClassIds: readonly string[];
  /** Not cancelled, with a dog to release, and not released. */
  unreleasedClassIds: readonly string[];
  /** Released, paperwork not printed (`phase === 'released'`). */
  toPrintClassIds: readonly string[];
  needsInitialsClassIds: readonly string[];
  doneClassIds: readonly string[];
  /** Per Results phase, over the classes that carried one. */
  phaseCounts: Readonly<Record<ResultsClassPhase, number>>;
  /**
   * The Results finish row's "all done": every class that ran is released and the judge has
   * signed. It does not look at printing; a class's own "Done" does (`doneClassIds`).
   * `false` when no class carried a phase.
   */
  releasedAndInitialed: boolean;
  /** `decisionsUnknown` above zero: saved refund decisions were not read, so `count` is partial. */
  refundReview: { count: number; removals: EntryRemovalCounts; decisionsUnknown: number };
  registryIds: readonly RegistryId[];
  lines: readonly WhatIsLeftLine[];
  /** The close step's sentences, in its order. */
  concerns: readonly string[];
  /** The same sentences, each with the kind it came from, so the close step can link one. */
  concernItems: readonly CloseConcern[];
}

const PHASES: readonly ResultsClassPhase[] = [
  'not-started',
  'in-ring',
  'needs-coin-flip',
  'needs-checking',
  'ready-to-release',
  'release-unknown',
  'released',
  'needs-initials',
  'done',
  'cancelled',
  'no-dogs',
];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function ids(classes: readonly WhatIsLeftClass[]): string[] {
  return classes.map(cls => cls.id);
}

function isCancelled(cls: WhatIsLeftClass): boolean {
  return cls.phase === 'cancelled' || isCancelledStatus(cls.status);
}

/** The Results finish row's rule, unchanged: every class that ran is released and initialed. */
function isReleasedAndInitialed(classes: readonly WhatIsLeftClass[]): boolean {
  const withPhase = classes.filter(cls => cls.phase !== undefined);
  // A class that ran, plus any class that owes the judge's sign-off without a dog to release.
  const ran = withPhase.filter(
    cls => (cls.phase !== 'cancelled' && cls.phase !== 'no-dogs') || cls.takesJudgeSignOff === true
  );
  return (
    ran.length > 0 &&
    ran.every(
      cls =>
        (cls.phase === 'released' || cls.phase === 'done') &&
        // Nothing to release when no dog was expected.
        (Boolean(cls.releasedAt) || cls.expectedCount === 0) &&
        (cls.judgeSignedOffAt ?? null) !== null
    )
  );
}

export function calculateWhatIsLeft(input: WhatIsLeftInput): WhatIsLeft {
  const { classes } = input;

  // A class whose counts could not be READ is not a class with nothing outstanding.
  const unknown = classes.filter(
    cls => (cls.expectedCount == null || cls.scoredCount == null) && needsCascade(cls.status)
  );
  const unscored = classes.filter(
    cls =>
      cls.expectedCount != null &&
      cls.scoredCount != null &&
      Number(cls.expectedCount) > 0 &&
      Number(cls.scoredCount) < Number(cls.expectedCount) &&
      needsCascade(cls.status)
  );
  // A pending entry is out of the scoring count (#2712) but is not resolved.
  const pendingReview = classes.filter(
    cls => Number(cls.pendingCount ?? 0) > 0 && needsCascade(cls.status)
  );
  const unreleased = classes.filter(
    cls =>
      cls.releasedAt !== undefined &&
      !isCancelled(cls) &&
      cls.expectedCount !== 0 &&
      !cls.releasedAt
  );
  const phased = classes.filter(cls => cls.phase !== undefined);
  const byPhase = (phase: ResultsClassPhase) => phased.filter(cls => cls.phase === phase);
  const toPrint = byPhase('released');
  const needsInitials = byPhase('needs-initials');
  const phaseCounts = Object.fromEntries(
    PHASES.map(phase => [phase, byPhase(phase).length])
  ) as Record<ResultsClassPhase, number>;

  // Only the pull/refund figures matter to close-out, and they do not depend on when an entry
  // was taken, so no desk window is needed here.
  const reconciliation = summarizeShowDayReconciliation([...input.entries], null);
  const submittedRows = input.submissions?.filter(row =>
    SUBMITTED_STATUSES.has(normalizeCloseoutStatus(row.status))
  );
  const hasSubmittedResults = submittedRows?.some(() => true);
  // A submission names the registry it went to; one that names none (an older row) covers every
  // registry rather than leaving a line open that was in fact sent.
  const registrySubmitted = (registryId: RegistryId): boolean =>
    submittedRows?.some(
      row => !row.organization || row.organization.toUpperCase() === registryId
    ) ?? false;

  const registryByTrial = new Map<string, RegistryId>();
  const registryIds: RegistryId[] = [];
  for (const trial of input.trials) {
    const registryId = getTrialRegistry(trial).id;
    if (trial.id) registryByTrial.set(trial.id, registryId);
    if (!registryIds.includes(registryId)) registryIds.push(registryId);
  }

  const lines: WhatIsLeftLine[] = [];
  const unreadable = (n: number) => `${plural(n, 'class has', 'classes have')}`;
  lines.push({
    key: 'unknown-counts',
    kind: 'unknown-counts',
    label: 'Classes whose entries could not be read',
    count: unknown.length,
    classIds: ids(unknown),
    open: unknown.length > 0,
    closeConcern: `${unreadable(unknown.length)} entry data we could not load, so scoring completeness is unknown.`,
  });
  lines.push({
    key: 'unscored',
    kind: 'unscored',
    label: `${plural(unscored.length, 'class', 'classes')} with unscored entries`,
    count: unscored.length,
    classIds: ids(unscored),
    open: unscored.length > 0,
    closeConcern: `${plural(unscored.length, 'class still has', 'classes still have')} unscored entries.`,
  });
  lines.push({
    key: 'pending-review',
    kind: 'pending-review',
    label: `${plural(pendingReview.length, 'class', 'classes')} with entries waiting for review`,
    count: pendingReview.length,
    classIds: ids(pendingReview),
    open: pendingReview.length > 0,
    closeConcern: `${plural(pendingReview.length, 'class still has', 'classes still have')} entries waiting for review.`,
  });
  // MYK9-2031: the marked catalog names the handler when it differs from the owner (AKC Scent Work
  // regulations ch. 3 sec. 36), so these are settled before the catalog is made.
  const clashes = input.handlerClashes;
  lines.push({
    key: 'handler-clash',
    kind: 'handler-clash',
    label: clashes
      ? `${plural(clashes.count, 'dog has', 'dogs have')} the same handler as another dog in their class. Choose who handles each before printing the marked catalog.`
      : 'Handlers to check',
    count: clashes?.count ?? null,
    classIds: clashes?.classIds ?? [],
    open: clashes ? clashes.count > 0 : null,
  });
  lines.push({
    key: 'unreleased',
    kind: 'unreleased',
    label: `${plural(unreleased.length, 'class', 'classes')} to release`,
    count: unreleased.length,
    classIds: ids(unreleased),
    open: classes.some(cls => cls.releasedAt !== undefined) ? unreleased.length > 0 : null,
  });
  lines.push({
    key: 'to-print',
    kind: 'to-print',
    label: `${plural(toPrint.length, 'class', 'classes')} with results to print`,
    count: toPrint.length,
    classIds: ids(toPrint),
    open: phased.length > 0 ? toPrint.length > 0 : null,
  });

  for (const registryId of registryIds) {
    // A class that names no trial belongs to a registry only when the show has just the one.
    const classesOfRegistry = needsInitials.filter(cls =>
      cls.trialId === undefined
        ? registryIds.length === 1
        : registryByTrial.get(cls.trialId) === registryId
    );
    for (const duty of getCloseoutDuties(registryId)) {
      if (duty.kind === 'judge-sign-off') {
        lines.push({
          key: duty.key,
          kind: 'judge-sign-off',
          label: duty.label,
          count: classesOfRegistry.length,
          classIds: ids(classesOfRegistry),
          open: phased.length > 0 ? classesOfRegistry.length > 0 : null,
          registryId,
        });
      } else {
        const sentAt =
          duty.recordedBy === 'app'
            ? newestSubmissionAt(input.submissions, registryId, 'sent')
            : null;
        const read = input.scoreChanges;
        let sentFileCheck: SentFileCheck | undefined;
        if (sentAt !== null && read !== undefined) {
          const coveredAt = coveredUntil(input.submissions, registryId) ?? sentAt;
          if (read.status !== 'read')
            sentFileCheck = read.status === 'loading' ? 'checking' : 'unknown';
          else {
            sentFileCheck = 'current';
            for (const cls of classes) {
              const belongs =
                cls.trialId === undefined
                  ? registryIds.length === 1
                  : registryByTrial.get(cls.trialId) === registryId;
              const changedAt = read.latestByClass.get(cls.id);
              if (belongs && changedAt && Date.parse(changedAt) > coveredAt)
                sentFileCheck = 'changed';
            }
          }
        }
        const deadline = duty.deadline
          ? resultsDeadlineFor(
              registryId,
              lastTrialDay(
                input.trials
                  .filter(
                    trial =>
                      getTrialRegistry(trial).id === registryId &&
                      !isCancelledStatus(trial.status) &&
                      resultsDeadlineCoversTrialType(trial.trialType)
                  )
                  .map(trial => ({ date: trial.trialDate, timeZone: getTrialTimezone(trial) }))
              )
            )
          : null;
        lines.push({
          key: duty.key,
          kind: 'results-submission',
          ...(deadline === null ? {} : { deadline }),
          ...(sentFileCheck === undefined ? {} : { sentFileCheck }),
          label: duty.label,
          count: null,
          classIds: [],
          // Unread is its own state: offline, it may not claim "nothing submitted".
          open: input.submissions === null ? null : !registrySubmitted(registryId),
          registryId,
        });
      }
    }
  }

  const refundCount = reconciliation.refundReviewCount;
  // MYK9-2099: a removal whose saved decision was not read may already be denied. Unknown is its
  // own state: the line claims neither a count nor "nothing left".
  const refundDecisionsUnknown = reconciliation.refundDecisionUnknownCount > 0;
  lines.push({
    key: 'refund-review',
    kind: 'refund-review',
    label: refundDecisionsUnknown
      ? 'Refunds to decide: saved refund decisions could not be loaded'
      : `${plural(refundCount, 'refund', 'refunds')} to decide`,
    count: refundDecisionsUnknown ? null : refundCount,
    classIds: [],
    open: refundDecisionsUnknown ? null : refundCount > 0,
    closeConcern: refundDecisionsUnknown
      ? 'Saved refund decisions could not be loaded, so the refunds still to decide are unknown.'
      : `${refundCount} paid ${refundCount === 1 ? 'entry' : 'entries'} (${describeEntryRemovals(reconciliation.refundReviewRemovals)}) ${refundCount === 1 ? 'needs' : 'need'} refund review.`,
  });
  // MYK9-2145: a check-in flag the Check-in desk has not confirmed. Not a removal and not a refund
  // to decide (docs/INTENT.md, Withdraw vs Pull), but the close step names it.
  const flaggedCount = reconciliation.flaggedPullDogCount;
  lines.push({
    key: 'flagged-pulls',
    kind: 'flagged-pulls',
    label: flaggedPullText(flaggedCount),
    count: flaggedCount,
    classIds: [],
    open: flaggedCount > 0,
    closeConcern: flaggedPullText(flaggedCount),
  });
  const incidentCount = input.incidents?.reportableCount ?? 0;
  lines.push({
    key: 'incidents',
    kind: 'incidents',
    label: `${plural(incidentCount, 'reportable incident', 'reportable incidents')} in the log`,
    count: input.incidents === null ? null : incidentCount,
    classIds: [],
    open: input.incidents === null ? null : incidentCount > 0,
    closeConcern:
      input.incidents === null
        ? 'The incident log could not be checked, so open reportable incidents are unknown.'
        : `${incidentCount} reportable ${incidentCount === 1 ? 'incident is' : 'incidents are'} still in the incident log.`,
  });

  const concernItems = buildCloseConcerns({
    lines,
    submissionsUnread: input.submissions === null,
    hasSubmittedResults: Boolean(hasSubmittedResults),
  });

  return {
    unknownCountClassIds: ids(unknown),
    unscoredClassIds: ids(unscored),
    pendingReviewClassIds: ids(pendingReview),
    unreleasedClassIds: ids(unreleased),
    toPrintClassIds: ids(toPrint),
    needsInitialsClassIds: ids(needsInitials),
    doneClassIds: ids(byPhase('done')),
    phaseCounts,
    releasedAndInitialed: isReleasedAndInitialed(classes),
    refundReview: {
      count: refundCount,
      removals: reconciliation.refundReviewRemovals,
      decisionsUnknown: reconciliation.refundDecisionUnknownCount,
    },
    registryIds,
    lines,
    concerns: concernItems.map(item => item.text),
    concernItems,
  };
}

/** The Results tab's status-filter chip counts: classes whose phase the filter lists. */
export function countClassesForFilter(left: WhatIsLeft, filter: ResultsStatusFilterId): number {
  return PHASES.reduce(
    (sum, phase) => sum + (matchesResultsStatusFilter(phase, filter) ? left.phaseCounts[phase] : 0),
    0
  );
}
