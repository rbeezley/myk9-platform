import { useMemo } from 'react';
import { useSecretaryShowEntriesQuery } from '@/hooks/queries/useEntriesDatabase';
import { collectFlaggedPulls, type FlaggedPullsRead } from './flaggedPulls';

export type CloseoutFlaggedPulls = FlaggedPullsRead & {
  /** Re-reads the entries; handed to the Check-in desk's Confirm and Clear as their refresh. */
  refresh: () => Promise<void>;
};

/**
 * MYK9-2180: the single source of unconfirmed check-in pull flags for the Results tab's Finish
 * list and the close step (its summary card, the close action and its confirmation). Both render
 * this result, so they cannot show two counts for one show.
 *
 * It reads the canonical show entries query (`useSecretaryShowEntriesQuery`, replication-backed),
 * the same cache both screens already read, re-read on mount so a flag confirmed at the Check-in
 * desk shows on return. The screens' own replica subscriptions invalidate that query on a write.
 *
 * States: `loading` until the first read, `failed` whenever the latest read did not succeed (an
 * error, or settled with no data), even with older rows still cached: a count from stale rows is
 * never shown as current. Otherwise `read`, with the flags and the "Class removed" ones.
 */
export function useCloseoutFlaggedPulls(showId: string | undefined): CloseoutFlaggedPulls {
  const query = useSecretaryShowEntriesQuery(showId ?? '', Boolean(showId), {
    rereadOnMount: true,
  });
  const { data, isError, isLoading, refetch } = query;
  const list = useMemo(() => (data ? collectFlaggedPulls(data) : null), [data]);
  return useMemo<CloseoutFlaggedPulls>(() => {
    const refresh = async () => {
      await refetch();
    };
    if (isError) return { status: 'failed', refresh };
    if (!list) return { status: isLoading ? 'loading' : 'failed', refresh };
    return { status: 'read', ...list, refresh };
  }, [isError, isLoading, list, refetch]);
}
