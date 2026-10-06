/**
 * Per-class paperwork state (check-in sheet, score sheets, results sheet, armband and ribbon
 * labels) assembled from the SAME class rows Reports fingerprints and the replicated print
 * confirmations (MYK9-1031).
 *
 * A print is "current" only when the descriptor built here equals the one the confirmation stored,
 * so every surface that answers "is this printed?" must build it from the same class rows. Reports
 * reads them with `getClassesByTrialId`; this hook is that read plus `buildClassPaperworkMap`, in
 * one place. Overview (`ShowDeskPanel`) and Reports still assemble their own and should migrate
 * onto it (MYK9-1032).
 *
 * Both sub-reads are reported as `ReadStatus` so the caller can fold them with `combineReads`, and
 * `available` is false until BOTH can be trusted: without the class rows or the confirmations,
 * "not printed" is not a finding and no print row should be drawn from it.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ReadStatus } from '@/features/_shared/combineReads';
import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import { getClassesByTrialId } from '@/services/database/classes';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import { buildClassPaperworkMap } from './buildClassPaperworkMap';
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
    queryFn: async () => {
      const results = await Promise.all(trialIds.map(id => getClassesByTrialId(id)));
      const failed = results.find(result => result.error);
      if (failed?.error) throw failed.error;
      return results.flatMap(({ data }) => data ?? []);
    },
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

  const reads: ReadStatus[] = [
    {
      key: 'class-rows',
      critical: false,
      hasData: classFacts.data !== undefined,
      isLoading: classFacts.isLoading,
      isError: classFacts.isError,
    },
    {
      key: 'print-history',
      critical: false,
      hasData: prints.data !== undefined && !prints.syncFailed,
      isLoading: prints.isLoading,
      isError: prints.isError || prints.syncFailed,
    },
  ];

  return {
    byClassId,
    available,
    reads,
    /** Refetches the class rows and re-syncs the print confirmations. */
    refetch: () => {
      void classFacts.refetch();
      prints.resync?.();
      void prints.refetch();
    },
  };
}
