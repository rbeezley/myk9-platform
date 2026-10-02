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
}

const PRINT_STATE: Record<SecretaryCockpitPaperwork['state'], ClassChecklistState> = {
  current: 'done',
  stale: 'reprint',
  unconfirmed: 'todo',
  unknown: 'unknown',
};

// "Ready for wrap-up" means no entry needed a signature (all pulled or scratched).
const SIGNED: ReadonlySet<string> = new Set([
  SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
  SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY,
  SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
]);

function printItem(
  id: ClassChecklistItemId,
  label: string,
  paperwork: readonly SecretaryCockpitPaperwork[]
): ClassChecklistItem {
  const row = paperwork.find(item => item.reportId === id);
  return row
    ? { id, label, state: PRINT_STATE[row.state], paperwork: row }
    : { id, label, state: 'todo', detail: 'Nothing to print yet' };
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
  const signature: ClassChecklistState = input.wrapUpStatus
    ? SIGNED.has(input.wrapUpStatus)
      ? 'done'
      : 'todo'
    : countsKnown || lifecycleKnown
      ? 'todo'
      : 'unknown';

  return [
    printItem('check-in-sheet', 'Check-in sheet', input.paperwork),
    printItem('scoresheet', 'Score sheets', input.paperwork),
    { id: 'class-started', label: 'Class started', state: started },
    scoring,
    printItem('results-sheet', 'Preliminary results', input.paperwork),
    printItem('result-labels', 'Ribbon labels', input.paperwork),
    { id: 'judge-signature', label: 'Judge signature collected', state: signature },
  ];
}

export function summarizeClassChecklist(items: readonly ClassChecklistItem[]): {
  done: number;
  total: number;
  unknown: number;
} {
  return {
    done: items.filter(item => item.state === 'done').length,
    total: items.length,
    unknown: items.filter(item => item.state === 'unknown').length,
  };
}
