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
