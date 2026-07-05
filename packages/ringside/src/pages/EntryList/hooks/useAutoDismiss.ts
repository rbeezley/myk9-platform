import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a `trigger` that shows a transient flag and auto-hides it after
 * `delayMs`, with a correctly-managed timer lifecycle:
 *
 * - **Clears on unmount** — the pending hide never fires a `setState` after the
 *   owning component is gone (no React "update on unmounted component" and no
 *   leaked timer).
 * - **Resets on rapid re-trigger** — a second trigger inside the dismiss window
 *   cancels the in-flight hide and starts a fresh window, so back-to-back saves
 *   don't cut the toast short.
 *
 * The visible flag itself stays owned by the caller's state (`setVisible`);
 * this hook only owns the timer. Replaces the fire-and-forget
 * `setTimeout(() => setVisible(false), …)` anti-pattern.
 */
export function useAutoDismiss(
  setVisible: (visible: boolean) => void,
  delayMs = 2000
): () => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const trigger = useCallback(() => {
    setVisible(true);
    clear();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, delayMs);
  }, [setVisible, delayMs, clear]);

  // Clear any pending hide when the owner unmounts.
  useEffect(() => clear, [clear]);

  return trigger;
}
