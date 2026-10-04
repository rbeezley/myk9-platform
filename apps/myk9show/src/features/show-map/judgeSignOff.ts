/**
 * MYK9-1009: the words for the judge's sign-off on a completed class, per registry.
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
  actionWhy: string;
  needsStatusLabel: string;
  doneStatusLabel: string;
  checklistLabel: string;
  checklistNoneDetail: string;
  resultsControlInstruction: string;
  /** "2 classes need judge's initials" / "1 class needs judge signature". */
  pendingSignalLabel: (count: number) => string;
}

const AKC_WORDING: JudgeSignOffWording = {
  actionLabel: "Collect judge's initials",
  actionWhy: "Completed class still needs the judge's initials",
  needsStatusLabel: "Needs judge's initials",
  doneStatusLabel: 'Initialed by judge',
  checklistLabel: "Judge's initials collected",
  checklistNoneDetail: 'No entries to initial',
  resultsControlInstruction:
    "Verify the judge's initials on the printed result catalog before sending.",
  pendingSignalLabel: count =>
    `${count} ${count === 1 ? 'class needs' : 'classes need'} judge's initials`,
};

const SIGNATURE_WORDING: JudgeSignOffWording = {
  actionLabel: 'Collect judge signature',
  actionWhy: 'Completed class still needs judge sign-off',
  needsStatusLabel: 'Needs judge signature',
  doneStatusLabel: 'Signed by judge',
  checklistLabel: 'Judge signature collected',
  checklistNoneDetail: 'No entries to sign',
  resultsControlInstruction: 'Verify judge signatures on the paper reports before sending.',
  pendingSignalLabel: count =>
    `${count} ${count === 1 ? 'class needs' : 'classes need'} judge signature`,
};

export function judgeSignOffWording(registryId: string | null | undefined): JudgeSignOffWording {
  return (resolveConfiguredRegistryId(registryId) ?? 'AKC') === 'AKC'
    ? AKC_WORDING
    : SIGNATURE_WORDING;
}
