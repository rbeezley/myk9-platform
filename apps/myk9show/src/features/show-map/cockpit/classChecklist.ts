import { judgeSignOffWording } from '../judgeSignOff';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { CockpitLifecycle, SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/**
 * One class's checklist (MYK9-948): everything that has to happen for it and where each item
 * stands. Items complete in any order -- sheets get reprinted after a move-up, results get
 * printed before the signature -- so nothing here gates anything else. The system checks an
 * item off when it can tell; print items can also be marked printed by the secretary.
 *
 * Pure, so the Overview schedule can count the same items (MYK9-943) without a second rule.
 */

/** `reprint`: printed, but the class data changed since, so the paper is out of date. */
export type ClassChecklistState = 'done' | 'todo' | 'reprint' | 'unknown';

type ClassChecklistItemId =
  | 'check-in-sheet'
  | 'scoresheet'
  | 'class-started'
  | 'scoring-complete'
  | 'results-sheet'
  | 'result-labels'
  | 'judge-signature';

export interface ClassChecklistItem {
  id: ClassChecklistItemId;
  label: string;
  state: ClassChecklistState;
  detail?: string;
  /** Present on print items that have something to print, so print and Mark printed stay. */
  paperwork?: SecretaryCockpitPaperwork;
}

export interface ClassChecklistInput {
  lifecycle?: CockpitLifecycle | null | undefined;
  entryCount?: number | null | undefined;
  scoredCount?: number | null | undefined;
  /** Set only once every entry is scored or the class is complete (`classifyClassWrapUpStatus`). */
  wrapUpStatus?: string | null | undefined;
  paperwork: readonly SecretaryCockpitPaperwork[];
  /** The show's registry; selects initials (AKC) or signature wording. */
  registryId?: string | null | undefined;
}

const PRINT_STATE: Record<SecretaryCockpitPaperwork['state'], ClassChecklistState> = {
  current: 'done',
  stale: 'reprint',
  unconfirmed: 'todo',
  unknown: 'unknown',
};

const SIGNED: ReadonlySet<string> = new Set([
  SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
  SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY,
]);

// `entriesKnown` is false when Show Day could not read the entries (it nulls both counts). The
// tree then sees zero entries: no paperwork rows exist, and a Complete class classifies as
// "ready for wrap-up". Neither is a fact about the class, so both read as unknown.
function printItem(
  id: ClassChecklistItemId,
  label: string,
  paperwork: readonly SecretaryCockpitPaperwork[],
  entriesKnown: boolean
): ClassChecklistItem {
  const row = paperwork.find(item => item.reportId === id);
  if (row) return { id, label, state: PRINT_STATE[row.state], paperwork: row };
  return entriesKnown
    ? { id, label, state: 'todo', detail: 'Nothing to print yet' }
    : { id, label, state: 'unknown' };
}

function signatureItem(input: ClassChecklistInput, entriesKnown: boolean): ClassChecklistItem {
  const wording = judgeSignOffWording(input.registryId);
  const base = { id: 'judge-signature' as const, label: wording.checklistLabel };
  const status = input.wrapUpStatus;
  if (status && SIGNED.has(status)) return { ...base, state: 'done' };
  if (status === SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP) {
    // Every entry was pulled or scratched, so nothing needed signing.
    return entriesKnown
      ? { ...base, state: 'done', detail: wording.checklistNoneDetail }
      : { ...base, state: 'unknown' };
  }
  if (status || input.lifecycle === 'not-started' || entriesKnown)
    return { ...base, state: 'todo' };
  return { ...base, state: 'unknown' };
}

export function buildClassChecklist(input: ClassChecklistInput): ClassChecklistItem[] {
  if (input.lifecycle === 'cancelled') return [];

  const countsKnown = input.entryCount != null && input.scoredCount != null;
  const scoringComplete = Boolean(input.wrapUpStatus) || input.lifecycle === 'complete';
  const lifecycleKnown = input.lifecycle != null;

  const started: ClassChecklistState =
    scoringComplete || input.lifecycle === 'in-progress'
      ? 'done'
      : lifecycleKnown
        ? 'todo'
        : 'unknown';
  const scoring: ClassChecklistItem = {
    id: 'scoring-complete',
    label: 'Scoring complete',
    state: scoringComplete ? 'done' : countsKnown ? 'todo' : 'unknown',
    ...(!scoringComplete && countsKnown && started === 'done'
      ? { detail: `${input.scoredCount} of ${input.entryCount} scored` }
      : {}),
  };
  return [
    printItem('check-in-sheet', 'Check-in sheet', input.paperwork, countsKnown),
    printItem('scoresheet', 'Score sheets', input.paperwork, countsKnown),
    { id: 'class-started', label: 'Class started', state: started },
    scoring,
    printItem('results-sheet', 'Preliminary results', input.paperwork, countsKnown),
    printItem('result-labels', 'Ribbon labels', input.paperwork, countsKnown),
    signatureItem(input, countsKnown),
  ];
}

export interface ClassChecklistSummary {
  done: number;
  total: number;
  unknown: number;
  /** Each item's state in checklist order, for the schedule row's strip. */
  states: ClassChecklistState[];
}

export function summarizeClassChecklist(
  items: readonly ClassChecklistItem[]
): ClassChecklistSummary {
  return {
    done: items.filter(item => item.state === 'done').length,
    total: items.length,
    unknown: items.filter(item => item.state === 'unknown').length,
    states: items.map(item => item.state),
  };
}
