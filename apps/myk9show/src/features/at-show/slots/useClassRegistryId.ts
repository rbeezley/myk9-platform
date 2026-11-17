/**
 * The sanctioning registry for a class, read from its trial on this device (offline-safe).
 * Used where the caller has the class but not its trial (My Shows opens the same Requirements
 * view Ringside does). `known` wins when given; empty until the trial is read.
 */
import { useEffect, useState } from 'react';
import { getTrialRegistry } from '@/features/registries';
import { replicatedTrialsTable } from '@/services/replication';

export function useClassRegistryId(
  trialId: string | undefined,
  known: string | undefined,
  enabled: boolean
): string {
  const [read, setRead] = useState<{ trialId: string; id: string } | null>(null);
  useEffect(() => {
    if (known || !enabled || !trialId) return;
    let cancelled = false;
    void (async () => {
      try {
        const trial = await replicatedTrialsTable.getTrialById(trialId);
        if (!cancelled && trial) setRead({ trialId, id: getTrialRegistry(trial).id });
      } catch {
        // No trial on this device: the cards render without a registry label.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trialId, known, enabled]);
  if (known) return known;
  return read && read.trialId === trialId ? read.id : '';
}
