import { useMemo } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import type { SecretaryEntry } from '@/services/database/entries';
import { collectFlaggedPulls, type FlaggedPullsRead } from './flaggedPulls';

export type CloseoutFlaggedPulls = FlaggedPullsRead & {
  /** Re-reads the entries; handed to the Check-in desk's Confirm and Clear as their refresh. */
  refresh: () => Promise<void>;
};

/** The parts of a screen's show entries query (`useSecretaryShowEntriesQuery`) the flags read. */
export type FlaggedPullsEntriesQuery = Pick<
  UseQueryResult<SecretaryEntry[]>,
  'data' | 'isError' | 'isLoading' | 'failureCount' | 'refetch'
>;

/**
 * MYK9-2180: the single source of unconfirmed check-in pull flags for the Results tab's Finish
 * list and the close step (its summary card, the close action and its confirmation). Both derive
 * it here from the entries query they already hold (`useResultsTabData`, `useShowCloseoutInputs`,
 * each the replication-backed `useSecretaryShowEntriesQuery` with one re-read on mount), so the
 * two cannot disagree and no screen reads the entries twice.
 *
 * States: `loading` until the first read; `failed` whenever the latest read did not succeed (an
 * error, a failed attempt awaiting or paused before its retry, or settled with no data), even with
 * older rows still cached: a count from stale rows is never shown as current. Otherwise `read`.
 * The confirmed schedule tells a removed class from one this device only could not load.
 */
export function useCloseoutFlaggedPulls(query: FlaggedPullsEntriesQuery): CloseoutFlaggedPulls {
  const { data, isError, isLoading, failureCount, refetch } = query;
  const schedule = useShowDeskScheduleRead();
  const trialClasses = schedule.hasConfirmedSnapshot ? schedule.trialClasses : null;
  const list = useMemo(
    () => (data ? collectFlaggedPulls(data, trialClasses) : null),
    [data, trialClasses]
  );
  return useMemo<CloseoutFlaggedPulls>(() => {
    const refresh = async () => {
      await refetch();
    };
    // A failure resets to 0 only on a successful read.
    if (isError || failureCount > 0) return { status: 'failed', refresh };
    if (!list) return { status: isLoading ? 'loading' : 'failed', refresh };
    return { status: 'read', ...list, refresh };
  }, [failureCount, isError, isLoading, list, refetch]);
}
