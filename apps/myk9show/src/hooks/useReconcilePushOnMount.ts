import { useEffect, useRef, useState } from 'react';
import type { ReconcileOptions, ReconcileOutcome } from '@/hooks/usePushSubscription';

/**
 * Runs `reconcile` once per signed-in user and reports whether it is in flight,
 * so the push switch can stay disabled and a tap cannot race the lookup.
 *
 * When the first pass reports `unavailable` (the service worker was not ready
 * inside the lookup's short wait), the switch is released but the hook keeps
 * listening: `serviceWorker.ready` is event-driven, so one more reconcile runs
 * the moment the worker is ready, without navigation and without a timer; that
 * pass reads Off if the ready worker still cannot say (`workerReady`). The
 * retry is dropped if the component unmounted or the user changed.
 */
export function useReconcilePushOnMount(
  userId: string | undefined,
  reconcile: (options?: ReconcileOptions) => Promise<ReconcileOutcome | void>
): boolean {
  const [settledFor, setSettledFor] = useState<string | undefined>(undefined);
  const reconcileRef = useRef(reconcile);

  useEffect(() => {
    reconcileRef.current = reconcile;
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      let outcome: ReconcileOutcome | void = 'settled';
      try {
        outcome = await reconcileRef.current();
      } finally {
        if (active) setSettledFor(userId);
      }
      if (outcome !== 'unavailable' || !active) return;
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
      try {
        await navigator.serviceWorker.ready;
      } catch {
        return;
      }
      if (active) await reconcileRef.current({ workerReady: true });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  return userId !== undefined && settledFor !== userId;
}
