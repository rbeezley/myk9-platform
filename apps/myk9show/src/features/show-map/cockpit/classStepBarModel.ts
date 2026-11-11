import type { ClassChecklistItem, ClassChecklistState } from './classChecklist';
import { STEP_STATE_TEXT } from './classStepActions';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/** One card on the class step bar: a checklist item, or the merged "Print paperwork" card. */
export interface ClassStep {
  id: string;
  label: string;
  state: ClassChecklistState;
  detail?: string | undefined;
  /** Set only on the merged card when it opens the print records: its whole accessible name. */
  accessibleName?: string;
  /** Set only on the merged card: pressing it opens the "Other paperwork" print records. */
  opensRecords?: boolean;
}

export const PRINT_BUNDLE_ID = 'print-paperwork';

const PAPERWORK_STATE: Record<SecretaryCockpitPaperwork['state'], ClassChecklistState> = {
  current: 'done',
  stale: 'reprint',
  unconfirmed: 'todo',
  unknown: 'unknown',
};

/** The three documents that are usually printed together, in the order they are used. */
export const BUNDLED_DOCUMENTS = [
  { reportId: 'armband-labels', name: 'Armband labels' },
  { reportId: 'check-in-sheet', name: 'Check-in sheet' },
  { reportId: 'scoresheet', name: 'Score sheets' },
] as const;

const BUNDLED_STEP_IDS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);

/**
 * The step bar's cards (MYK9-1871). The check-in sheet and score sheets steps become ONE
 * "Print paperwork" card, with armband labels, in the first sheet's position; it opens the existing
 * print records rather than printing anything itself. The checklist items
 * themselves are untouched, so the "x of 7 done" count and the schedule strip read as before.
 */
export function buildClassSteps(
  items: readonly ClassChecklistItem[],
  paperwork: readonly SecretaryCockpitPaperwork[]
): ClassStep[] {
  const firstBundled = items.findIndex(item => BUNDLED_STEP_IDS.has(item.id));
  if (firstBundled < 0) return [...items];

  const present = BUNDLED_DOCUMENTS.flatMap(doc => {
    const row = paperwork.find(entry => entry.reportId === doc.reportId);
    return row ? [{ ...doc, row }] : [];
  });
  const printed = present.filter(doc => doc.row.state === 'current').length;
  const states = present.map(doc => PAPERWORK_STATE[doc.row.state]);
  const bundledItems = items.filter(item => BUNDLED_STEP_IDS.has(item.id));
  // A reprint outranks everything; otherwise any unknown row makes the whole card unknown, so a
  // failed print sync never reads as "0 of 3 printed".
  const state: ClassChecklistState =
    present.length === 0
      ? bundledItems.every(item => item.state === 'unknown')
        ? 'unknown'
        : 'todo'
      : states.includes('reprint')
        ? 'reprint'
        : states.includes('unknown')
          ? 'unknown'
          : printed === present.length
            ? 'done'
            : 'todo';
  const detail =
    present.length === 0
      ? 'Nothing to print yet'
      : state === 'unknown'
        ? 'Print status unknown'
        : `${printed} of ${present.length} printed`;
  const label = 'Print paperwork';
  const bundle: ClassStep = {
    id: PRINT_BUNDLE_ID,
    label,
    state,
    detail,
    ...(present.length > 0
      ? {
          opensRecords: true,
          accessibleName: `${label}: ${present.map(doc => doc.name.toLowerCase()).join(', ')}. ${state === 'unknown' ? detail : `${STEP_STATE_TEXT[state]}, ${detail}`}. Show print records`,
        }
      : {}),
  };
  return items.flatMap<ClassStep>((item, index) =>
    index === firstBundled ? [bundle] : BUNDLED_STEP_IDS.has(item.id) ? [] : [item]
  );
}
