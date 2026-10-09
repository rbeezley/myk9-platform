/**
 * What a class needs from the secretary on the Results tab (MYK9-1031).
 *
 * One pure function owns the answer, so the list's Status chip, its Next action
 * link, the "Needs me" filter and the detail's Primary work card cannot drift
 * apart. A class lives on Overview until scoring is complete, then on Results
 * (`docs/plan-results-tab-redesign.md`).
 *
 * Part 2 (MYK9-1031) feeds the two stored facts that finish the flow, both read in
 * {@link deriveResultsPhase} and nowhere else: `verifiedAt` (checked against the paper) and
 * `judgeSignedOffAt` (the judge's end-of-day initials), giving Verify, Release, Print, Initials,
 * Done.
 */
import { CLASS_STATUS, LEGACY_STATUS_MAP } from '@myk9/core';

export interface ResultsClassState {
  /** The class's stored status, in any spelling the schedule carries. */
  classStatus: string | null | undefined;
  /** Dogs the class expects to put in the ring (excludes pulled, withdrawn, absent entries). */
  expectedCount: number;
  /** Of `expectedCount`, those the server counts as accounted for (scored, absent, excused). */
  scoredCount: number;
  /**
   * `classes.results_released_at`. `null` = confirmed unreleased; `undefined` = the release state
   * could not be read for this class, which proves nothing (never offer Release on it).
   */
  releasedAt: string | null | undefined;
  /**
   * The results sheet AND the ribbon labels both have a current print confirmation.
   * `null` means the print history could not be read, which proves nothing either way.
   */
  paperworkPrinted: boolean | null;
  /**
   * When the secretary's check against the paper score sheets was recorded for this class
   * (`classes.results_verified_at`, cleared server-side when a result changes), counted only
   * while no score change of the class is waiting to sync. `null` = not checked, whether or not
   * the class is released; `undefined` = not tracked here, so it never gates anything.
   */
  verifiedAt?: string | null | undefined;
  /**
   * `classes.judge_signed_off_at`. `null` = not yet initialed; `undefined` = not tracked, so the
   * class never waits on initials.
   */
  judgeSignedOffAt?: string | null | undefined;
  /**
   * The judge still has a class to run that day. The judge initials once, at the END of the day
   * (MYK9-1030), so a class does not ask for initials while its judge is still judging.
   */
  judgeDayOpen?: boolean | undefined;
}

export type ResultsClassPhase =
  | 'not-started'
  | 'in-ring'
  | 'needs-checking'
  | 'ready-to-release'
  | 'release-unknown'
  | 'released'
  | 'needs-initials'
  | 'done'
  | 'cancelled'
  | 'no-dogs';

export type ResultsNextActionKind =
  'overview' | 'verify' | 'release' | 'print' | 'initials' | 'none';

export interface ResultsNextAction {
  kind: ResultsNextActionKind;
  label: string;
}

function normalizedClassStatus(raw: string | null | undefined): string {
  if (!raw) return CLASS_STATUS.SCHEDULED;
  return LEGACY_STATUS_MAP[raw] ?? raw;
}

export function deriveResultsPhase(state: ResultsClassState): ResultsClassPhase {
  const status = normalizedClassStatus(state.classStatus);
  if (status === CLASS_STATUS.CANCELLED) return 'cancelled';
  // Pulled-only (or empty) class: nothing ran, so there is nothing to check, release or print.
  if (state.expectedCount === 0) return 'no-dogs';

  // Complete is the server's own rule (every expected dog accounted for), not the stored status:
  // a class marked Completed with a dog still unscored stays on Overview, where that dog is fixed.
  if (state.scoredCount < state.expectedCount) {
    return state.scoredCount > 0 || status === CLASS_STATUS.IN_PROGRESS ? 'in-ring' : 'not-started';
  }
  if (state.releasedAt === undefined) return 'release-unknown';
  // Unchecked comes before released: a class whose check was undone, or cleared by a correction,
  // goes back to Check scores even after its results were released.
  if (state.verifiedAt === null) return 'needs-checking';
  if (state.releasedAt) {
    if (state.paperworkPrinted !== true) return 'released';
    return state.judgeSignedOffAt === null && state.judgeDayOpen !== true
      ? 'needs-initials'
      : 'done';
  }
  return 'ready-to-release';
}

const NEXT_ACTION_BY_PHASE: Record<ResultsClassPhase, ResultsNextAction> = {
  'not-started': { kind: 'overview', label: 'Overview' },
  'in-ring': { kind: 'overview', label: 'Overview' },
  'needs-checking': { kind: 'verify', label: 'Check scores' },
  'ready-to-release': { kind: 'release', label: 'Release' },
  'release-unknown': { kind: 'none', label: 'Status unknown' },
  released: { kind: 'print', label: 'Print' },
  // The label is the AKC wording; a signature registry overrides it (buildResultsClassRows).
  'needs-initials': { kind: 'initials', label: 'Initials' },
  done: { kind: 'none', label: 'Done' },
  cancelled: { kind: 'none', label: 'Cancelled' },
  'no-dogs': { kind: 'none', label: 'Nothing to do' },
};

export function deriveResultsNextAction(state: ResultsClassState): ResultsNextAction {
  return NEXT_ACTION_BY_PHASE[deriveResultsPhase(state)];
}

export const RESULTS_PHASE_LABEL: Record<ResultsClassPhase, string> = {
  'not-started': 'Not started',
  'in-ring': 'In the ring',
  'needs-checking': 'Needs checking',
  'ready-to-release': 'Ready to release',
  'release-unknown': 'Release status unknown',
  released: 'Released',
  'needs-initials': "Needs judge's initials",
  done: 'Done',
  cancelled: 'Cancelled',
  'no-dogs': 'No dogs ran',
};

export type ResultsStatusFilterId =
  'needs-me' | 'all' | 'needs-checking' | 'ready-to-release' | 'released' | 'done';

export const DEFAULT_RESULTS_STATUS_FILTER: ResultsStatusFilterId = 'needs-me';

const NEEDS_ME: ReadonlySet<ResultsClassPhase> = new Set([
  'needs-checking',
  'ready-to-release',
  'released',
  'needs-initials',
]);

const FILTER_PHASES: Record<ResultsStatusFilterId, ReadonlySet<ResultsClassPhase> | null> = {
  'needs-me': NEEDS_ME,
  all: null,
  'needs-checking': new Set(['needs-checking']),
  'ready-to-release': new Set(['ready-to-release']),
  released: new Set(['released', 'needs-initials', 'done']),
  done: new Set(['done']),
};

export function matchesResultsStatusFilter(
  phase: ResultsClassPhase,
  filter: ResultsStatusFilterId
): boolean {
  const phases = FILTER_PHASES[filter];
  return phases === null || phases.has(phase);
}

export const RESULTS_STATUS_FILTER_OPTIONS: readonly {
  id: ResultsStatusFilterId;
  label: string;
}[] = [
  { id: 'needs-me', label: 'Needs me' },
  { id: 'all', label: 'All classes' },
  { id: 'needs-checking', label: 'Needs checking' },
  { id: 'ready-to-release', label: 'Ready to release' },
  { id: 'released', label: 'Released' },
  { id: 'done', label: 'Done' },
];

export function isResultsStatusFilterId(value: string | null): value is ResultsStatusFilterId {
  return RESULTS_STATUS_FILTER_OPTIONS.some(option => option.id === value);
}
