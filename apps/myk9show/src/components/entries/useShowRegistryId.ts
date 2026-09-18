/**
 * MYK9-632: which rulebook governs this show's withdrawals — and whether we know.
 *
 * A show never mixes sanctioning bodies (MYK9-490, "one registry per show"), so
 * the FIRST trial's `registry_id` answers for the whole show. Read through the
 * replicated trials table — the same source `canModifyEntry` already uses — so
 * the dialog needs no new prop and works from the offline replica when it holds
 * the show.
 *
 * THERE IS NO DEFAULT, deliberately. This hook used to return 'AKC' while the
 * read was in flight and again whenever it failed or the show was absent from
 * the replica, which made "we do not know yet" and "this is an AKC show" the
 * same value. An ASCA show has NO in-season withdrawal at all — bitches in
 * season may compete — so an exhibitor who opened the dialog before the read
 * landed was offered a reason their rulebook does not have, and could record it.
 *
 * The three states are distinct so the dialog can say which one it is in:
 *  - `resolving`   — ask again in a moment; Withdraw is not offered yet.
 *  - `resolved`    — this registry's reasons, and only those.
 *  - `unavailable` — we could not find out. Withdraw stays closed; Pull does not
 *                    depend on the rulebook and stays available.
 *
 * `unavailable` covers BOTH failure shapes on purpose: the read threw, and the
 * read succeeded but named no configured registry (an empty replica, a trial
 * with a blank or unrecognised `registry_id`). Neither tells us the rules.
 */
import { useEffect, useState } from 'react';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { resolveConfiguredRegistryId } from '@/features/registries';
import type { RegistryId } from '@/features/registries';

export type ShowRegistryResolution =
  | { status: 'resolving' }
  | { status: 'resolved'; registry: RegistryId }
  | { status: 'unavailable' };

const RESOLVING: ShowRegistryResolution = { status: 'resolving' };
const UNAVAILABLE: ShowRegistryResolution = { status: 'unavailable' };

/**
 * A stable string for "which rulebook is in force", including the two states
 * that name no rulebook. The dialog keys its reason selection on this, so a
 * reason chosen under one answer can never be carried into another.
 */
export function registryResolutionKey(resolution: ShowRegistryResolution): string {
  return resolution.status === 'resolved' ? `resolved:${resolution.registry}` : resolution.status;
}

export function useShowRegistryId(
  showId: string | undefined,
  enabled: boolean
): ShowRegistryResolution {
  // Stamped with the show it was resolved FOR, so a resolution can never be
  // applied to a different show — the same guard `useWithdrawEligibility` uses
  // for its id set, and the reason a stale answer cannot outlive a re-open.
  const [resolved, setResolved] = useState<{
    showId: string;
    value: ShowRegistryResolution;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !showId) return undefined;

    let cancelled = false;
    void (async () => {
      let value: ShowRegistryResolution = UNAVAILABLE;
      try {
        const trials = await replicatedTrialsTable.getTrialsByShow(showId);
        for (const trial of trials) {
          const candidate = resolveConfiguredRegistryId(trial.registryId);
          if (candidate) {
            value = { status: 'resolved', registry: candidate };
            break;
          }
        }
      } catch {
        value = UNAVAILABLE;
      }
      if (!cancelled) setResolved({ showId, value });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, showId]);

  if (!enabled || !showId) return RESOLVING;
  return resolved?.showId === showId ? resolved.value : RESOLVING;
}
