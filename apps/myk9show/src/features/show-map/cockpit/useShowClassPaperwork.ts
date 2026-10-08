/**
 * Per-class paperwork state (check-in sheet, score sheets, results sheet, armband and ribbon
 * labels) assembled from the SAME class rows Reports fingerprints and the replicated print
 * confirmations (MYK9-1031).
 *
 * A print is "current" only when the descriptor built here equals the one the confirmation stored,
 * so every surface that answers "is this printed?" must build it from the same class rows.
 * Overview (`ShowDeskPanel`) uses this hook; Reports reads its class rows through the same
 * `useShowClassRows` hook (one query key), and both gate on `resolveReportReadiness`.
 *
 * `available` is false until BOTH sub-reads can be trusted: without the class rows or the confirmations,
 * "not printed" is not a finding. React Query keeps `data` after a failed or in-flight refetch, so
 * the class read must be `ready` (settled, not erroring, not refetching), never merely have data.
 *
 * A status that reads unknown never hides an action: while the class rows are loading or failed,
 * rows still render from the tree classes (print link only, state unknown, no confirmation, because
 * those rows lack the facts a fingerprint includes and would record a print against obsolete facts).
 */
import { useMemo } from 'react';

import { readinessOf, resolveReportReadiness } from '@/hooks/queries/reportReadiness';
import { useShowClassRows } from '@/hooks/queries/useShowClassRows';
import type { DbClass, DbEntry } from '@/types/database-mappings';
import { buildClassPaperworkMap } from './buildClassPaperworkMap';
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
  const prints = useShowPaperworkPrints(showId);
  const trialIds = useMemo(() => trials.map(trial => trial.id), [trials]);

  // The same cached read Reports fingerprints (one key, one subscription, refetch on mount).
  const classFacts = useShowClassRows({
    showId,
    trialId: 'all',
    trialIds,
    enabled: trialIds.length > 0,
  });

  // Only a settled read counts: `data` survives a failed or in-flight refetch, and cached rows
  // that are being replaced describe obsolete facts, so a confirmation recorded now would stamp
  // a fingerprint nobody can match. `ready` is Reports' rule for the same question.
  const classesAvailable = resolveReportReadiness([readinessOf(classFacts)]) === 'ready';
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
