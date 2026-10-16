/**
 * Keep the toast stack off a block of content that lives inside a scrolling pane.
 *
 * `useRegisterActionBar` reserves a bar's own HEIGHT, which is right for a bar pinned to the
 * bottom edge. A block inside a scrolling pane (the Results detail pane's "Then" paperwork
 * rows, MYK9-1217) moves as the pane scrolls. The stack only ever occupies the bottom
 * `TOAST_ZONE_PX` of the viewport, so this reserves clearance only while the block's top is
 * inside that zone, and exactly the overlap: `innerHeight - top`. A block above the zone cannot
 * be covered and reserves nothing, so the lift never exceeds `TOAST_ZONE_PX` and the stack never
 * leaves the screen or covers the header. Recomputed on scroll, resize and reflow.
 *
 * Publishes through the same action-bar registry `AppToaster` already reads, and withdraws on
 * detach, unmount, or `enabled` going false. A block below the fold reserves nothing.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import { TOAST_ZONE_PX } from '@/components/layout/toastGeometry';
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
        if (distance > 0 && distance <= TOAST_ZONE_PX)
          useActionBarStore.getState().setHeight(id, distance);
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
