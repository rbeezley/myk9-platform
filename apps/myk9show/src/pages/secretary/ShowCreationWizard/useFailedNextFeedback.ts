import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { focusFirstInvalidField } from '@/components/forms';

/**
 * What a failed Next click does: focus the first field that failed and centre it, or, when
 * the only problems belong to no single field, scroll the top banner into view.
 *
 * Call the returned function from the click handler. On the first failed attempt the field
 * errors (and so `aria-invalid`) only mount on the render that click triggers, so the work
 * is deferred to an effect; on a repeat attempt nothing re-renders, so it runs at once.
 * `scrollIntoView` is a no-op stub in jsdom, hence the typeof guard.
 */
export function useFailedNextFeedback(
  stepContentRef: RefObject<HTMLElement | null>,
  bannerRef: RefObject<HTMLElement | null>
): () => void {
  const pendingRef = useRef(false);

  const reveal = useCallback((): void => {
    if (focusFirstInvalidField(stepContentRef.current)) return;
    const banner = bannerRef.current;
    if (banner) {
      // `start` honours the banner's scroll margin, so its heading lands below the sticky
      // chrome; `center` put it underneath on a phone (MYK9-764).
      if (typeof banner.scrollIntoView === 'function') {
        banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    pendingRef.current = true;
  }, [stepContentRef, bannerRef]);

  // One-shot per first attempt, not on every render as fields are corrected.
  useEffect(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    reveal();
  });

  return reveal;
}
