import { replicatedShowsTable, replicatedTrialsTable } from '@/services/replication';
import { reportDebug } from '@/utils/standardizedErrorHandler';

interface TrialDay {
  date: string;
  deletedAt?: string | undefined;
}

export interface DerivedShowDates {
  startDate: string;
  endDate: string;
}

/**
 * MYK9-2131: a show's dates are its live trials' dates (the server keeps them so). The
 * earliest and latest day as calendar days, the form a typed show date is stored in, or
 * null when no live trial exists (the show keeps what it has).
 */
export function deriveShowDatesFromTrials(trials: readonly TrialDay[]): DerivedShowDates | null {
  const days = trials
    .filter(trial => !trial.deletedAt && trial.date)
    .map(trial => trial.date.slice(0, 10))
    .sort();
  const startDate = days[0];
  const endDate = days[days.length - 1];
  return startDate && endDate ? { startDate, endDate } : null;
}

/**
 * After a local trial write, bring the replicated show's dates in line so an offline
 * device shows the right days at once; online, the server trigger agrees with it. A failure
 * is logged and never fails the trial write that already happened.
 */
export async function syncReplicatedShowDates(showId: string | undefined): Promise<void> {
  if (!showId) return;
  try {
    const derived = deriveShowDatesFromTrials(await replicatedTrialsTable.getTrialsByShow(showId));
    if (!derived) return;
    const show = await replicatedShowsTable.get(showId);
    if (!show) return;
    if (
      show.startDate?.slice(0, 10) === derived.startDate &&
      show.endDate?.slice(0, 10) === derived.endDate
    ) {
      return;
    }
    await replicatedShowsTable.updateShow(showId, derived);
  } catch (error) {
    reportDebug('store', 'Could not bring the show dates in line with its trials', {
      showId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
