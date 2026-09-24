import { useMemo } from 'react';
import type { DeskCollectionWindow } from '@/features/show-workbench/showDayReconciliationSummary';
import { getEntryWindowTimezone, type EntryWindowTrial } from '@/utils/entryWindowDate';

interface ShowDeskTrial {
  id: string;
  trialDate?: string | null | undefined;
  timezone?: string | null | undefined;
}

/**
 * MYK9-677: when the show was running, on the show's own calendar (its first
 * trial's zone, as the entry window is), so the closeout card counts only
 * money taken at the desk.
 */
export function useShowDeskCollectionWindow(
  showStartDate: string | null | undefined,
  trials: readonly ShowDeskTrial[]
): DeskCollectionWindow {
  return useMemo(() => {
    const windowTrials: EntryWindowTrial[] = trials.map(trial => ({
      id: trial.id,
      date: trial.trialDate,
      timezone: trial.timezone,
    }));
    return { showStartDate, timeZone: getEntryWindowTimezone(windowTrials) };
  }, [showStartDate, trials]);
}
