import { useEffect, useRef } from 'react';
import { replicatedClassesTable } from './ReplicatedClassesTable';

interface HideCacheBoundaryState {
  userId: string | null;
  canReadHideCounts: boolean | null;
}

export interface ClassHideCacheBoundaryOptions {
  /** Auth has completed its initial session restore. */
  authReady: boolean;
  userId: string | null;
  /** Null while RBAC is still resolving; preserve the last known capability. */
  canReadHideCounts: boolean | null;
}

/**
 * Keeps the shared class cache from carrying official-only hide counts across
 * an account switch or an RBAC privilege change. The first ready snapshot is a
 * baseline so a page reload preserves the same user's offline scoring cache.
 */
export function useClassHideCacheBoundary({
  authReady,
  userId,
  canReadHideCounts,
}: ClassHideCacheBoundaryOptions): void {
  const previous = useRef<HideCacheBoundaryState | null>(null);

  useEffect(() => {
    if (!authReady) return;

    const prior = previous.current;
    const identityChanged = prior !== null && prior.userId !== userId;
    const capabilityChanged =
      prior !== null &&
      canReadHideCounts !== null &&
      prior.canReadHideCounts !== null &&
      prior.canReadHideCounts !== canReadHideCounts;

    if (identityChanged || capabilityChanged) {
      void replicatedClassesTable.clearCachedHideCounts().catch(() => {
        // Cache cleanup must never block auth or route transitions. The next
        // successful boundary/sync retries the scrub under the same contract.
      });
    }

    previous.current = {
      userId,
      canReadHideCounts: canReadHideCounts ?? prior?.canReadHideCounts ?? null,
    };
  }, [authReady, canReadHideCounts, userId]);
}
