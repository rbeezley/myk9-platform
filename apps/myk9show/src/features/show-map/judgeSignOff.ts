/**
 * MYK9-1009: the words for the judge's sign-off on a completed class, per registry.
 * MYK9-1030: the judge signs off once at the END of their day, for every class they judged.
 *
 * AKC Scent Work Regulations Ch.3 §37 has the judge INITIAL each page of the marked
 * catalog, so on an AKC show the secretary collects the judge's initials. UKC and
 * ASCA keep the signature-and-date sign-off, so every other registry reads exactly
 * as it did before this change. One helper, so the action, the wrap-up status, the
 * pending signal, the class checklist and the Results Control instruction cannot
 * disagree with one another or with the printed Result Catalog.
 *
 * Takes the show's registry id as the show-map already carries it (a show never
 * mixes registries, MYK9-490); unresolvable or absent resolves to AKC, the same
 * default `getTrialRegistry` uses.
 */
import { resolveConfiguredRegistryId } from '@/features/registries';

export interface JudgeSignOffWording {
  actionLabel: string;
  /** The Results tab's Next action when the judge's sign-off is the step left: "Initials". */
  nextActionLabel: string;
  actionWhy: string;
  needsStatusLabel: string;
  /** MYK9-1030: complete, but the judge still has classes to run that day (neutral). */
  endOfDayStatusLabel: string;
  doneStatusLabel: string;
  checklistLabel: string;
  checklistNoneDetail: string;
  checklistEndOfDayDetail: string;
  resultsControlInstruction: string;
  /** "Record initials: Jane Smith, Sat, Oct 10": records the sign-off for the judge's whole day. */
  recordActionLabel: (judgeName: string | undefined, day: string) => string;
  recordActionWhy: string;
  /** Per-class undo of a recorded sign-off. */
  undoActionLabel: string;
  recordedMessage: (count: number) => string;
  undoneMessage: string;
  /** "2 classes need judge's initials" / "1 class needs judge signature". */
  pendingSignalLabel: (count: number) => string;
}

const AKC_WORDING: JudgeSignOffWording = {
  actionLabel: "Collect judge's initials",
  nextActionLabel: 'Initials',
  actionWhy: "Completed class still needs the judge's initials",
  needsStatusLabel: "Needs judge's initials",
  endOfDayStatusLabel: 'Initials at end of day',
  doneStatusLabel: 'Initialed by judge',
  checklistLabel: "Judge's initials collected",
  checklistNoneDetail: 'No entries to initial',
  checklistEndOfDayDetail: 'Judge initials at end of day',
  resultsControlInstruction:
    "Verify the judge's initials on the printed result catalog before sending.",
  recordActionLabel: (judgeName, day) =>
    `Record initials: ${judgeName?.trim() || 'judge'}${day ? `, ${day}` : ''}`,
  recordActionWhy: "Records the judge's initials on every completed class they judged that day",
  undoActionLabel: 'Undo initials',
  recordedMessage: count => `Initials recorded on ${count} ${count === 1 ? 'class' : 'classes'}`,
  undoneMessage: 'Initials removed',
  pendingSignalLabel: count =>
    `${count} ${count === 1 ? 'class needs' : 'classes need'} judge's initials`,
};

const SIGNATURE_WORDING: JudgeSignOffWording = {
  actionLabel: 'Collect judge signature',
  nextActionLabel: 'Signature',
  actionWhy: 'Completed class still needs judge sign-off',
  needsStatusLabel: 'Needs judge signature',
  endOfDayStatusLabel: 'Signature at end of day',
  doneStatusLabel: 'Signed by judge',
  checklistLabel: 'Judge signature collected',
  checklistNoneDetail: 'No entries to sign',
  checklistEndOfDayDetail: 'Judge signs at end of day',
  resultsControlInstruction: 'Verify judge signatures on the paper reports before sending.',
  recordActionLabel: (judgeName, day) =>
    `Record signature: ${judgeName?.trim() || 'judge'}${day ? `, ${day}` : ''}`,
  recordActionWhy: "Records the judge's signature on every completed class they judged that day",
  undoActionLabel: 'Undo signature',
  recordedMessage: count => `Signature recorded on ${count} ${count === 1 ? 'class' : 'classes'}`,
  undoneMessage: 'Signature removed',
  pendingSignalLabel: count =>
    `${count} ${count === 1 ? 'class needs' : 'classes need'} judge signature`,
};

export function judgeSignOffWording(registryId: string | null | undefined): JudgeSignOffWording {
  return (resolveConfiguredRegistryId(registryId) ?? 'AKC') === 'AKC'
    ? AKC_WORDING
    : SIGNATURE_WORDING;
}
