import type { EntrySubmissionOutcome } from '@/services/database/entries';
import type { ClassSelectionData } from '@/types/show-registration-types';

export interface EntrySubmissionOutcomeSummary {
  createdCount: number;
  waitlistedCount: number;
  deniedCount: number;
  overrideCount: number;
}

export function summarizeEntrySubmissionOutcomes(
  outcomes: EntrySubmissionOutcome[] | undefined
): EntrySubmissionOutcomeSummary {
  return (outcomes ?? []).reduce<EntrySubmissionOutcomeSummary>(
    (summary, outcome) => ({
      createdCount: summary.createdCount + (outcome.outcome === 'created' ? 1 : 0),
      waitlistedCount: summary.waitlistedCount + (outcome.outcome === 'waitlisted' ? 1 : 0),
      deniedCount: summary.deniedCount + (outcome.outcome === 'denied' ? 1 : 0),
      overrideCount: summary.overrideCount + (outcome.capacityOverride ? 1 : 0),
    }),
    { createdCount: 0, waitlistedCount: 0, deniedCount: 0, overrideCount: 0 }
  );
}

/** `denial_reason` strings written by `public.evaluate_entry_capacity`. */
const CROSS_EXHIBITOR_WAITLIST_REASON =
  'dog already on this class wait list for a different exhibitor';
/** MYK9-980: the server's copy of the class step's re-entry rule (MYK9-982). */
const WITHDRAWN_FROM_CLASS_DENIAL_REASON = 'dog was withdrawn or pulled from this class';

/** The sentence after "Dog — Class:" for a denied selection. */
export function getEntrySubmissionDenialMessage(outcome: EntrySubmissionOutcome): string {
  if (outcome.denialReason === CROSS_EXHIBITOR_WAITLIST_REASON) {
    return 'already has an active wait-list spot for another exhibitor.';
  }
  if (outcome.denialReason === WITHDRAWN_FROM_CLASS_DENIAL_REASON) {
    return 'was withdrawn or pulled from this class, so it cannot be entered online again. The show secretary can add it.';
  }

  return 'could not be entered because the class is full.';
}

export function hasCreatedEntryOutcome(outcomes: EntrySubmissionOutcome[] | undefined): boolean {
  return !outcomes?.length || outcomes.some(outcome => outcome.outcome === 'created');
}

export function getCreatedOutcomeTotalFees(
  outcomes: EntrySubmissionOutcome[] | undefined,
  legacyTotalFees: number
): number {
  if (!outcomes?.length) return legacyTotalFees;
  return outcomes
    .filter(outcome => outcome.outcome === 'created')
    .reduce((total, outcome) => total + outcome.feeCents / 100, 0);
}

export function filterClassSelectionsToCreatedOutcomes(
  selections: ClassSelectionData[],
  outcomes: EntrySubmissionOutcome[] | undefined
): ClassSelectionData[] {
  if (!outcomes?.length) return selections;

  const createdSelections = new Set(
    outcomes
      .filter(outcome => outcome.outcome === 'created')
      .map(outcome => `${outcome.dogId}:${outcome.classId}`)
  );

  return selections.flatMap(selection => {
    const selectedClasses = selection.selectedClasses.filter(selectedClass =>
      createdSelections.has(`${selection.dogId}:${selectedClass.classId}`)
    );
    return selectedClasses.length > 0 ? [{ ...selection, selectedClasses }] : [];
  });
}
