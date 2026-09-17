/**
 * MYK9-632: which rulebook governs this show's withdrawals.
 *
 * A show never mixes sanctioning bodies (MYK9-490, "one registry per show"), so
 * the FIRST trial's `registry_id` answers for the whole show. Read through the
 * replicated trials table — the same source `canModifyEntry` already uses — so
 * the dialog needs no new prop and works from the offline replica when it holds
 * the show.
 *
 * Defaults to AKC while the lookup is in flight and whenever the trial names no
 * configured registry, matching `getTrialRegistry`. That default decides only
 * which reasons are OFFERED and what the copy says; the server's own allow-list
 * is what actually admits a reason code.
 */
import { useEffect, useState } from 'react';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { resolveConfiguredRegistryId } from '@/features/registries';
import type { RegistryId } from '@/features/registries';

export function useShowRegistryId(showId: string | undefined, enabled: boolean): RegistryId {
  const [registryId, setRegistryId] = useState<RegistryId>('AKC');

  useEffect(() => {
    if (!enabled || !showId) return undefined;

    let cancelled = false;
    void (async () => {
      let resolved: RegistryId | null = null;
      try {
        const trials = await replicatedTrialsTable.getTrialsByShow(showId);
        for (const trial of trials) {
          const candidate = resolveConfiguredRegistryId(trial.registryId);
          if (candidate) {
            resolved = candidate;
            break;
          }
        }
      } catch {
        resolved = null;
      }
      if (!cancelled) setRegistryId(resolved ?? 'AKC');
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, showId]);

  return registryId;
}
