/**
 * The paper check as the Results tab should show it (MYK9-1031).
 *
 * The stored stamp (`classes.results_verified_at`) is the server's word, and the server clears it
 * when a result changes. A correction made on THIS device before it syncs has not reached the
 * server yet, so the replica still says "checked" for results that are no longer the ones that
 * were checked. The replica row therefore keeps the fingerprint this device sent with its check
 * (`results_verified_fingerprint`, local only); when that no longer matches the class's results
 * on this device, the stamp is treated as cleared, so Release locks again at once instead of after
 * the next sync. A stamp with no local fingerprint (made on another device, or already echoed back
 * and cleared by the server's own rule) is the server's word and is shown as stored.
 *
 * While a fingerprint is still being computed a locally checked class reads as NOT checked: the
 * safe side for a gate in front of Release.
 */
import { useEffect, useMemo, useState } from 'react';

import { currentClassResultsFingerprint } from '@/features/show-map/resultsVerifiedMutations';

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
  const localChecks = useMemo(
    () =>
      (classRows ?? []).filter(
        row => row.results_verified_at != null && row.results_verified_fingerprint != null
      ),
    [classRows]
  );
  const [current, setCurrent] = useState<{
    rows: readonly VerifiedClassRow[];
    version: unknown;
    fingerprints: ReadonlyMap<string, string>;
  } | null>(null);

  useEffect(() => {
    if (localChecks.length === 0) return;
    let cancelled = false;
    void Promise.all(
      localChecks.map(async row => [row.id, await currentClassResultsFingerprint(row.id)] as const)
    )
      .then(pairs => {
        if (!cancelled) {
          setCurrent({ rows: localChecks, version: entriesVersion, fingerprints: new Map(pairs) });
        }
      })
      .catch(() => {
        // An unreadable replica proves nothing: the locally checked classes stay unchecked.
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localChecks, entriesVersion]);

  return useMemo(() => {
    if (!classRows) return undefined;
    const fresh = current?.rows === localChecks && current.version === entriesVersion;
    return new Map(
      classRows.map(row => {
        const at = row.results_verified_at ?? null;
        const sent = row.results_verified_fingerprint;
        const stillCurrent = sent == null || (fresh && current.fingerprints.get(row.id) === sent);
        return [
          row.id,
          {
            at: stillCurrent ? at : null,
            by: stillCurrent ? (row.results_verified_by ?? null) : null,
          },
        ] as const;
      })
    );
  }, [classRows, current, entriesVersion, localChecks]);
}
