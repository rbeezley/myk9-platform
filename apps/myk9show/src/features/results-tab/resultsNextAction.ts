/**
 * What a class needs from the secretary on the Results tab (MYK9-1031).
 *
 * One pure function owns the answer, so the list's Status chip, its Next action
 * link, the "Needs me" filter and the detail's Primary work card cannot drift
 * apart. A class lives on Overview until scoring is complete, then on Results
 * (`docs/plan-results-tab-redesign.md`).
 *
 * SEAMS for part 2 (not built here, see the plan's Phases 2 and 3): the input
 * gains `judgeSignedOffAt`, and `verifiedAt` starts being supplied. Both are
 * read in {@link deriveResultsPhase}, nowhere else.
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
   * Part 2 seam: when the secretary's check against the paper score sheets is stored per class,
   * pass it here. `undefined` means verification is not tracked, so it never gates anything;
   * `null` means tracked and not done yet.
   */
  verifiedAt?: string | null | undefined;
}

export type ResultsClassPhase =
  | 'not-started'
  | 'in-ring'
  | 'needs-checking'
  | 'ready-to-release'
  | 'release-unknown'
  | 'released'
  | 'done'
  | 'cancelled'
  | 'no-dogs';

export type ResultsNextActionKind = 'overview' | 'verify' | 'release' | 'print' | 'none';

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
  if (state.releasedAt) return state.paperworkPrinted === true ? 'done' : 'released';
  return state.verifiedAt === null ? 'needs-checking' : 'ready-to-release';
}

const NEXT_ACTION_BY_PHASE: Record<ResultsClassPhase, ResultsNextAction> = {
  'not-started': { kind: 'overview', label: 'Overview' },
  'in-ring': { kind: 'overview', label: 'Overview' },
  'needs-checking': { kind: 'verify', label: 'Check scores' },
  'ready-to-release': { kind: 'release', label: 'Release' },
  'release-unknown': { kind: 'none', label: 'Status unknown' },
  released: { kind: 'print', label: 'Print' },
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
  done: 'Done',
  cancelled: 'Cancelled',
  'no-dogs': 'No dogs ran',
};

export type ResultsStatusFilterId =
  'needs-me' | 'all' | 'needs-checking' | 'ready-to-release' | 'released' | 'done';

export const DEFAULT_RESULTS_STATUS_FILTER: ResultsStatusFilterId = 'needs-me';

/**
 * Whether the secretary's check against the paper is stored yet. While it is not, no class can be
 * "Needs checking", so the filter that would always be empty is not offered. Flip with part 2.
 */
export const RESULTS_VERIFICATION_TRACKED = false;

const NEEDS_ME: ReadonlySet<ResultsClassPhase> = new Set([
  'needs-checking',
  'ready-to-release',
  'released',
]);

const FILTER_PHASES: Record<ResultsStatusFilterId, ReadonlySet<ResultsClassPhase> | null> = {
  'needs-me': NEEDS_ME,
  all: null,
  'needs-checking': new Set(['needs-checking']),
  'ready-to-release': new Set(['ready-to-release']),
  released: new Set(['released', 'done']),
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

/** The filters worth offering today; see {@link RESULTS_VERIFICATION_TRACKED}. */
export function offeredResultsStatusFilters() {
  return RESULTS_STATUS_FILTER_OPTIONS.filter(
    option => option.id !== 'needs-checking' || RESULTS_VERIFICATION_TRACKED
  );
}
