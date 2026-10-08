/**
 * Per-class paperwork state (check-in sheet, score sheets, results sheet, armband and ribbon
 * labels) assembled from the SAME class rows Reports fingerprints and the replicated print
 * confirmations (MYK9-1031).
 *
 * A print is "current" only when the descriptor built here equals the one the confirmation stored,
 * so every surface that answers "is this printed?" must build it from the same class rows
 * (`readTrialClassRows`). Overview (`ShowDeskPanel`) uses this hook; Reports reads its class rows
 * through the same `readTrialClassRows`.
 *
 * `available` is false until BOTH sub-reads can be trusted: without the class rows or the confirmations,
 * "not printed" is not a finding and no print row should be drawn from it.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { readTrialClassRows } from './readTrialClassRows';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';
import { useShowPaperworkPrints } from './useShowPaperworkPrints';

export function useShowClassPaperwork(input: {
  showId: string;
  trials: readonly { id: string; trialDate: string }[];
  entries: readonly unknown[];
  returnTo: string;
}) {
  const { showId, trials, entries, returnTo } = input;
  const prints = useShowPaperworkPrints(showId);
  const trialIds = useMemo(() => trials.map(trial => trial.id), [trials]);
  const classFacts = useQuery({
    queryKey: [...queryKeys.showClasses(showId), 'paperwork', trialIds],
    queryFn: () => readTrialClassRows(trialIds),
    enabled: Boolean(showId) && trialIds.length > 0,
    ...cacheStrategies.moderate,
    networkMode: 'always',
  });

  const available =
    classFacts.data !== undefined &&
    prints.data !== undefined &&
    !prints.isError &&
    !prints.syncFailed;

  const byClassId = useMemo<ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>>(
    () =>
      buildClassPaperworkMap({
        showId,
        classes: (classFacts.data ?? []) as unknown as DbClass[],
        trials,
        entries: entries as unknown as DbEntry[],
        records: prints.data ?? [],
        recordsUnavailable: !available,
        returnTo,
      }),
    [available, classFacts.data, entries, prints.data, returnTo, showId, trials]
  );

  return {
    byClassId,
    available,
    /** Refetches the class rows and the print confirmations. */
    refetch: () => {
      void classFacts.refetch();
      void prints.refetch();
    },
  };
}
