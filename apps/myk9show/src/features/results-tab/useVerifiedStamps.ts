/**
 * The paper check as the Results tab should show it (MYK9-1031).
 *
 * The stored stamp (`classes.results_verified_at`) is the server's word, and the server clears it
 * when a result changes. A correction made on THIS device before it syncs has not reached the
 * server yet, so the replica still says "checked" for results that are no longer the ones that
 * were checked. So every stamp is compared with the results this device holds:
 *  - a check this device sent carries the fingerprint it sent (`results_verified_fingerprint`,
 *    local only); it stands only while the class's results still hash to it;
 *  - a check downloaded from the server has none, so the first time it is seen the results then
 *    held become its baseline (stored on the replica row, `rememberResultsBaseline`), and later
 *    changes retract it. If some entry already has a local change the server has not
 *    acknowledged, there is no honest baseline, so the check reads as not done.
 * A wrong "not checked" costs the secretary a re-tick; a wrong "checked" releases unchecked
 * scores, so every doubt resolves to not checked. While a snapshot is still being computed, a
 * checked class reads as not checked too.
 */
import { useEffect, useMemo, useState } from 'react';

import { classResultsSnapshot } from '@/features/show-map/resultsVerifiedMutations';
import { replicatedClassesTable } from '@/services/replication';

interface VerifiedClassRow {
  id: string;
  results_verified_at?: string | null | undefined;
  results_verified_by?: string | null | undefined;
  results_verified_fingerprint?: string | null | undefined;
}

export interface VerifiedStamp {
  at: string | null;
  by: string | null;
}

export function useVerifiedStamps(
  classRows: readonly VerifiedClassRow[] | undefined,
  /** Changes whenever the scores do (the entries read), so the comparison reruns after a Fix. */
  entriesVersion: unknown
): ReadonlyMap<string, VerifiedStamp> | undefined {
  const stamped = useMemo(
    () => (classRows ?? []).filter(row => row.results_verified_at != null),
    [classRows]
  );
  const [current, setCurrent] = useState<{
    rows: readonly VerifiedClassRow[];
    version: unknown;
    stillChecked: ReadonlySet<string>;
  } | null>(null);

  useEffect(() => {
    if (stamped.length === 0) return;
    let cancelled = false;
    void Promise.all(
      stamped.map(async row => {
        const { fingerprint, hasUnsyncedEntries } = await classResultsSnapshot(row.id);
        const sent = row.results_verified_fingerprint;
        if (sent != null) return fingerprint === sent ? row.id : null;
        if (hasUnsyncedEntries) return null;
        // First sight of a check made elsewhere: the results held now are its baseline.
        void replicatedClassesTable
          .rememberResultsBaseline(row.id, row.results_verified_at as string, fingerprint)
          .catch(() => undefined);
        return row.id;
      })
    )
      .then(ids => {
        if (cancelled) return;
        setCurrent({
          rows: stamped,
          version: entriesVersion,
          stillChecked: new Set(ids.filter((id): id is string => id !== null)),
        });
      })
      .catch(() => {
        // An unreadable replica proves nothing: every stamp stays unchecked.
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stamped, entriesVersion]);

  return useMemo(() => {
    if (!classRows) return undefined;
    const fresh = current?.rows === stamped && current.version === entriesVersion;
    return new Map(
      classRows.map(row => {
        const stillChecked =
          row.results_verified_at == null || (fresh && current.stillChecked.has(row.id));
        return [
          row.id,
          {
            at: stillChecked ? (row.results_verified_at ?? null) : null,
            by: stillChecked ? (row.results_verified_by ?? null) : null,
          },
        ] as const;
      })
    );
  }, [classRows, current, entriesVersion, stamped]);
}
