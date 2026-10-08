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
 * "not printed" is not a finding. React Query keeps `data` after a failed refetch, so a class read
 * that errored makes the hook unavailable even over cached rows.
 *
 * A status that reads unknown never hides an action: while the class rows are loading or failed,
 * rows still render from the tree classes (print link only, state unknown, no confirmation, because
 * those rows lack the facts a fingerprint includes and would record a print against obsolete facts).
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { cacheStrategies, queryKeys } from '@/lib/queryClient';
import { replicatedClassesTable } from '@/services/replication';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import { buildClassPaperworkMap } from './buildClassPaperworkMap';
import { readTrialClassRows } from './readTrialClassRows';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';
import { useShowPaperworkPrints } from './useShowPaperworkPrints';

export function useShowClassPaperwork(input: {
  showId: string;
  trials: readonly { id: string; trialDate: string }[];
  /** Tree class rows (camelCase): the print-link-only fallback while the full rows are unavailable. */
  classes: readonly { id: string; trialId?: string | null }[];
  entries: readonly unknown[];
  returnTo: string;
}) {
  const { showId, trials, classes, entries, returnTo } = input;
  const queryClient = useQueryClient();
  const prints = useShowPaperworkPrints(showId);
  const trialIds = useMemo(() => trials.map(trial => trial.id), [trials]);
  const classFactsKey = useMemo(() => [...queryKeys.showClasses(showId), 'paperwork'], [showId]);

  // The class rows are read from the replica, so a replicated class change (Mark complete,
  // offline included) is a change to every fingerprint built from them. Same signal and
  // `emitCurrent: false` as useReportData: re-read on notices, never on the initial emit.
  useEffect(() => {
    if (!showId) return;
    return replicatedClassesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: classFactsKey }),
      { emitCurrent: false }
    );
  }, [classFactsKey, queryClient, showId]);

  const classFacts = useQuery({
    queryKey: [...classFactsKey, trialIds],
    queryFn: () => readTrialClassRows(trialIds),
    enabled: Boolean(showId) && trialIds.length > 0,
    ...cacheStrategies.moderate,
    networkMode: 'always',
  });

  const classesAvailable = classFacts.data !== undefined && !classFacts.isError;
  const available =
    classesAvailable && prints.data !== undefined && !prints.isError && !prints.syncFailed;

  const byClassId = useMemo<ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>>(() => {
    return buildClassPaperworkMap({
      showId,
      classes: (classesAvailable
        ? (classFacts.data ?? [])
        : classes.map(classItem => ({
            ...classItem,
            trial_id: classItem.trialId,
          }))) as unknown as DbClass[],
      trials,
      entries: entries as unknown as DbEntry[],
      records: classesAvailable ? (prints.data ?? []) : [],
      recordsUnavailable: !available,
      withholdConfirmation: !classesAvailable,
      returnTo,
    });
  }, [
    available,
    classFacts.data,
    classes,
    classesAvailable,
    entries,
    prints.data,
    returnTo,
    showId,
    trials,
  ]);

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
