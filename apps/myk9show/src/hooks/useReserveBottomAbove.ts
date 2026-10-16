/**
 * Keep the toast stack off a block of content that lives anywhere above the viewport bottom.
 *
 * `useRegisterActionBar` reserves a bar's own HEIGHT, which is right for a bar pinned to the
 * bottom edge. A block inside a scrolling pane (the Results detail pane's "Then" paperwork
 * rows, MYK9-1217) sits some distance above the edge and moves as the pane scrolls, so its
 * height alone clears it only when it happens to end at the edge. This reserves the whole
 * distance from the viewport bottom up to the block's top instead, so the lifted stack ends
 * above the block wherever the block currently is. Recomputed on scroll, resize and reflow.
 *
 * Publishes through the same action-bar registry `AppToaster` already reads, and withdraws on
 * detach, unmount, or `enabled` going false. A block below the fold reserves nothing.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import { useActionBarStore } from '@/store/actionBarStore';

export function useReserveBottomAbove<T extends HTMLElement = HTMLDivElement>(enabled: boolean) {
  const id = useId();
  const cleanupRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    useActionBarStore.getState().unregister(id);
  }, [id]);

  const setRef = useCallback(
    (node: T | null) => {
      release();
      if (!node || !enabled) return;

      let frame = 0;
      const measure = () => {
        frame = 0;
        const distance = Math.round(window.innerHeight - node.getBoundingClientRect().top);
        if (distance > 0) useActionBarStore.getState().setHeight(id, distance);
        else useActionBarStore.getState().unregister(id);
      };
      const schedule = () => {
        if (frame === 0) frame = window.requestAnimationFrame(measure);
      };

      measure();
      // Capture: scroll does not bubble, and the scrolling ancestor is not the window.
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
      observer?.observe(node);
      if (node.parentElement) observer?.observe(node.parentElement);

      cleanupRef.current = () => {
        if (frame !== 0) window.cancelAnimationFrame(frame);
        window.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
        observer?.disconnect();
      };
    },
    [enabled, id, release]
  );

  // Unmounting the owner does not always detach the node first.
  useEffect(() => release, [release]);

  return setRef;
}
