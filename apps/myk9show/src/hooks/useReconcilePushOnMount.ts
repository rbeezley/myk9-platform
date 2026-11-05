import { useEffect, useRef, useState } from 'react';

/**
 * Runs `reconcile` once per signed-in user and reports whether it is in flight,
 * so the push switch can stay disabled and a tap cannot race the lookup.
 */
export function useReconcilePushOnMount(
  userId: string | undefined,
  reconcile: () => Promise<void>
): boolean {
  const [settledFor, setSettledFor] = useState<string | undefined>(undefined);
  const reconcileRef = useRef(reconcile);

  useEffect(() => {
    reconcileRef.current = reconcile;
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void reconcileRef.current().finally(() => {
      if (active) setSettledFor(userId);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return userId !== undefined && settledFor !== userId;
}
