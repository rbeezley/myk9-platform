import { useEffect, useRef } from 'react';
import { popOpenOverlay, pushOpenOverlay } from '@/lib/overlayStack';

/**
 * Registers a modal surface in the shared open-overlay stack for as long as it
 * is open, so `SlideOverPanel`'s topmost-only Escape handling accounts for it
 * (MYK9-523). `SlideOverPanel` and `CommonDialog` each inline this effect; a
 * Radix `Dialog` has no membership of its own, so any Radix dialog that can be
 * raised OVER a panel has to opt in — otherwise the panel behind it is still
 * "topmost" and one Escape closes the panel instead of the dialog.
 *
 * Deliberately depends ONLY on `open`: re-pushing an already-open id would move
 * it to the top of the stack and steal Escape from a surface that actually
 * opened later.
 */
export function useOverlayStackEntry(open: boolean, label = 'overlay'): void {
  const idRef = useRef<symbol>(Symbol(label));

  useEffect(() => {
    const id = idRef.current;
    if (!open) return;
    pushOpenOverlay(id);
    return () => popOpenOverlay(id);
  }, [open]);
}
