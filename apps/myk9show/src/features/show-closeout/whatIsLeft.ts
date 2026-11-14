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
import { getCloseoutDuties, getTrialRegistry, type RegistryId } from '@/features/registries';
import {
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from '@/features/show-workbench/showDayReconciliationSummary';
import type { ShowIncidentSummary } from '@/features/show-workbench/showIncidents';
import type { ResultsClassPhase } from '@/features/results-tab/resultsNextAction';
import { matchesResultsStatusFilter } from '@/features/results-tab/resultsNextAction';
import type { ResultsStatusFilterId } from '@/features/results-tab/resultsNextAction';
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
}

export interface WhatIsLeftInput {
  classes: readonly WhatIsLeftClass[];
  trials: readonly WhatIsLeftTrial[];
  entries: readonly ShowDayReconciliationEntry[];
  /** `null` when the incident log could not be read. */
  incidents: Pick<ShowIncidentSummary, 'reportableCount' | 'urgentCount'> | null;
  /** `null` when result submissions could not be read. */
  submissions:
    | readonly { status?: string | null | undefined; organization?: string | null | undefined }[]
    | null;
}

export type WhatIsLeftLineKey =
  | 'unknown-counts'
  | 'unscored'
  | 'pending-review'
  | 'unreleased'
  | 'to-print'
  | 'judge-sign-off'
  | 'results-submission'
  | 'refund-review'
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
  /** The sentence the close step shows for the line while it is open or unknown. */
  closeConcern?: string;
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
  refundReview: { count: number; removals: EntryRemovalCounts };
  registryIds: readonly RegistryId[];
  lines: readonly WhatIsLeftLine[];
  /** The close step's sentences, in its order. */
  concerns: readonly string[];
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
        lines.push({
          key: duty.key,
          kind: 'results-submission',
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
  lines.push({
    key: 'refund-review',
    kind: 'refund-review',
    label: `${plural(refundCount, 'refund', 'refunds')} to decide`,
    count: refundCount,
    classIds: [],
    open: refundCount > 0,
    closeConcern: `${refundCount} paid ${refundCount === 1 ? 'entry' : 'entries'} (${describeEntryRemovals(reconciliation.refundReviewRemovals)}) ${refundCount === 1 ? 'needs' : 'need'} refund review.`,
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

  // The close step's sentences, in its order. The submission is one show-level sentence, whatever
  // the registry, and unread is its own concern: it may not claim "nothing submitted".
  const submissionConcern =
    input.submissions === null
      ? 'Result submissions could not be checked, so whether results were sent is unknown.'
      : hasSubmittedResults
        ? null
        : 'No result submission has been recorded for this show.';
  const concernOf = (kind: WhatIsLeftLineKey): string[] => {
    const line = lines.find(candidate => candidate.kind === kind);
    return line?.closeConcern && line.open !== false ? [line.closeConcern] : [];
  };
  const concerns = [
    ...concernOf('unknown-counts'),
    ...concernOf('unscored'),
    ...concernOf('pending-review'),
    ...(submissionConcern ? [submissionConcern] : []),
    ...concernOf('refund-review'),
    ...concernOf('incidents'),
  ];

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
    refundReview: { count: refundCount, removals: reconciliation.refundReviewRemovals },
    registryIds,
    lines,
    concerns,
  };
}

/** The Results tab's status-filter chip counts: classes whose phase the filter lists. */
export function countClassesForFilter(left: WhatIsLeft, filter: ResultsStatusFilterId): number {
  return PHASES.reduce(
    (sum, phase) => sum + (matchesResultsStatusFilter(phase, filter) ? left.phaseCounts[phase] : 0),
    0
  );
}
