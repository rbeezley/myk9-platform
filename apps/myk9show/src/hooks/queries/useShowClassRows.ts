import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import { getClassesByTrialId } from '@/services/database/classes';
import { replicatedClassesTable } from '@/services/replication';

/**
 * THE class rows every paperwork fingerprint is built from.
 *
 * A print counts as current only when the fingerprint built now equals the one stored with the
 * confirmation, and that fingerprint includes class facts (`time_limit_seconds`, `num_areas`,
 * `judge_name`, ...). Reports and Overview must therefore read the SAME full rows, never project
 * their own: Overview's camelCase tree rows lack those facts, so a print confirmed on one surface
 * read as stale on the other. `getClassesByTrialId` is replication-backed, so this works offline.
 */
export async function readTrialClassRows(trialIds: readonly string[]) {
  const results = await Promise.all(trialIds.map(id => getClassesByTrialId(id)));
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
  return results.flatMap(({ data }) => data ?? []);
}

/**
 * The one cached read of a show's full class rows, shared by Reports (`useReportData`) and the
 * Overview cockpit (`useShowClassPaperwork`): one key, one subscription, one freshness rule.
 *
 * - Replica reads run with no network (`networkMode: 'always'`), so this works offline.
 * - A replicated class change (Mark complete, offline included) invalidates the key while any
 *   consumer is mounted. `emitCurrent: false`: re-read on notices, never on the initial emit.
 * - `refetchOnMount: 'always'`: a change made while NO consumer was mounted (Classes page, offline)
 *   was never seen by the subscription above, and `staleTime` would otherwise serve the old rows
 *   for five minutes. Each mount re-reads the replica, and the refetch reads as `refreshing`
 *   (see `resolveReportReadiness`) until it settles.
 */
export function useShowClassRows(input: {
  showId: string;
  /** `'all'` reads every trial in `trialIds`; a trial id reads just that trial. */
  trialId: string | 'all';
  trialIds: readonly string[];
  enabled?: boolean;
}) {
  const { showId, trialId, trialIds, enabled = true } = input;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!showId) return;
    return replicatedClassesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: queryKeys.showClasses(showId) }),
      { emitCurrent: false }
    );
  }, [queryClient, showId]);

  return useQuery({
    queryKey: [...queryKeys.showClasses(showId), trialId, trialId === 'all' ? trialIds : []],
    queryFn: () => readTrialClassRows(trialId === 'all' ? trialIds : [trialId]),
    enabled: Boolean(showId) && enabled,
    ...cacheStrategies.moderate,
    networkMode: 'always',
    refetchOnMount: 'always',
  });
}
