import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchClassSummary } from './showWorkbenchTypes';

export type SetupReadinessSignalId =
  | 'show-details-missing'
  | 'no-trials'
  | 'no-classes'
  | 'judges-missing'
  | 'exhibitor-materials-unpublished';

export interface SetupReadinessSignal {
  id: SetupReadinessSignalId;
  label: string;
}

export interface SetupReadinessInput {
  show: Show;
  trials: SyncableTrial[];
  classes: ShowWorkbenchClassSummary[];
  judges: unknown[];
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function showDetailsComplete(show: Show): boolean {
  return (
    hasText(show.name) &&
    hasText(show.organization) &&
    hasText(show.startDate) &&
    hasText(show.endDate) &&
    hasText(show.location) &&
    hasText(show.clubName)
  );
}

function judgesAssigned(input: SetupReadinessInput): boolean {
  if (input.judges.length > 0) return true;
  return input.classes.length > 0 && input.classes.every(cls => hasText(cls.judgeName));
}

function exhibitorMaterialsPublished(show: Show): boolean {
  return Boolean(show.publishedPremiumUrl || show.publishedPremiumAt || show.experienceIsPublished);
}

// INTENT: Mirror the Show Desk adaptive header's pending-signals contract —
// only emit a signal when it's NOT yet satisfied. Once the secretary
// finishes the setup step, the chip disappears instead of staying as a
// permanent "green check" item the eye has to filter past every visit.
export function computeSetupReadinessSignals(
  input: SetupReadinessInput
): SetupReadinessSignal[] {
  const signals: SetupReadinessSignal[] = [];
  if (!showDetailsComplete(input.show)) {
    signals.push({ id: 'show-details-missing', label: 'Show details incomplete' });
  }
  if (input.trials.length === 0) {
    signals.push({ id: 'no-trials', label: 'No trials yet' });
  }
  if (input.classes.length === 0) {
    signals.push({ id: 'no-classes', label: 'No classes built' });
  }
  if (!judgesAssigned(input)) {
    signals.push({ id: 'judges-missing', label: 'Judges not assigned' });
  }
  if (!exhibitorMaterialsPublished(input.show)) {
    signals.push({
      id: 'exhibitor-materials-unpublished',
      label: 'Exhibitor materials unpublished',
    });
  }
  return signals;
}

export function isSetupReady(input: SetupReadinessInput): boolean {
  return computeSetupReadinessSignals(input).length === 0;
}
