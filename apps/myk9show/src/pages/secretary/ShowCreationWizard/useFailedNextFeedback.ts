import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { focusFirstFieldControl } from '@/components/forms';

/**
 * What a failed Next click does: focus the first control (in document order) among the
 * BLOCKING issues' fields and centre it, or, when none is mounted, scroll the top banner into
 * view. Non-blocking local warnings never take the focus.
 *
 * Call the returned function from the click handler with the blocking issues' field ids. When
 * there is nothing to land on yet (the first failed attempt mounts the banner on the render
 * the click triggers), one retry runs after that render. The retry is one-shot: it clears
 * itself before trying and never re-arms, so a later edit cannot pull focus.
 * `scrollIntoView` is a no-op stub in jsdom, hence the typeof guard.
 */
export function useFailedNextFeedback(
  bannerRef: RefObject<HTMLElement | null>
): (fieldIds: readonly string[]) => void {
  const pendingRef = useRef<readonly string[] | null>(null);

  const attempt = useCallback(
    (fieldIds: readonly string[]): boolean => {
      if (focusFirstFieldControl(fieldIds)) return true;
      const banner = bannerRef.current;
      if (!banner) return false;
      // `start` honours the banner's scroll margin, so its heading lands below the sticky
      // chrome; `center` put it underneath on a phone (MYK9-764).
      if (typeof banner.scrollIntoView === 'function') {
        banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return true;
    },
    [bannerRef]
  );

  const reveal = useCallback(
    (fieldIds: readonly string[]): void => {
      if (!attempt(fieldIds)) pendingRef.current = fieldIds;
    },
    [attempt]
  );

  useEffect(() => {
    const fieldIds = pendingRef.current;
    if (!fieldIds) return;
    pendingRef.current = null;
    attempt(fieldIds);
  });

  return reveal;
}
