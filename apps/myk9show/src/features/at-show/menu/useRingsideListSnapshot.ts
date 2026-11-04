import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { RingsideListSnapshot, RingsideReturnLocationState } from './ringsideReturnStore';

export function useRingsideListSnapshot<Kind extends RingsideListSnapshot['kind']>(
  kind: Kind
): Extract<RingsideListSnapshot, { kind: Kind }> | undefined {
  const state = useLocation().state as RingsideReturnLocationState | null;
  const snapshot = state?.ringsideList;
  if (snapshot?.kind === kind) return snapshot as Extract<RingsideListSnapshot, { kind: Kind }>;
  return undefined;
}

/** The real list's menu mounts after its content is ready to scroll. */
export function useRestoreRingsideScroll(ready: boolean): void {
  const { key, state } = useLocation();
  const scrollY = (state as RingsideReturnLocationState | null)?.scrollY;
  useEffect(() => {
    if (!ready || typeof scrollY !== 'number' || scrollY <= 0) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, scrollY));
    return () => cancelAnimationFrame(frame);
  }, [key, ready, scrollY]);
}
