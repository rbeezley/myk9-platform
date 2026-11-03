import { useCallback, useRef, useState } from 'react';

/**
 * The host's side of a scoresheet's `onDirtyChange` (MYK9-1552). The state
 * drives rendering; the ref is written in the same call, so the route blocker
 * can read it at navigation time without waiting for the host to re-render.
 */
export function useScoresheetDirty() {
  const [sheetDirty, setSheetDirty] = useState(false);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setSheetDirty(dirty);
  }, []);
  return { sheetDirty, dirtyRef, onDirtyChange };
}
