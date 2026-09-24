export interface EntryCountState {
  status: 'loading' | 'unavailable' | 'ready';
  count: number;
}

export const hasCurrentEntryCounts = (entryCountState: EntryCountState): boolean =>
  entryCountState.status === 'ready' && entryCountState.count > 0;

/**
 * Estimated judging minutes for the selected classes, or null when there is
 * nothing honest to show. `minutesPerRun` is the template's
 * `defaults.judgingTimeEstimate`, which is minutes per dog run (MYK9-689
 * follow-up): the estimate is the sum over classes of entries x minutes, and
 * with one template-wide rate that is the total entry count x minutes. No
 * fallback rate: a template without one gets no estimate rather than a guess.
 */
export const estimateJudgingMinutes = (
  entryCountState: EntryCountState,
  minutesPerRun: number | undefined
): number | null => {
  if (!hasCurrentEntryCounts(entryCountState) || !minutesPerRun || minutesPerRun <= 0) {
    return null;
  }
  return entryCountState.count * minutesPerRun;
};
