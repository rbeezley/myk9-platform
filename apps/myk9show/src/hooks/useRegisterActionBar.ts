/**
 * Register a sticky action bar so overlays can stay clear of it.
 *
 * Returns a CALLBACK ref to attach to the bar's outermost element. The bar's
 * measured height is published to the action-bar registry while the node is
 * attached and withdrawn the moment it detaches.
 *
 * A callback ref rather than `useRef` + `useEffect`, because the bars this
 * serves are conditionally rendered. `SlideOverPanel` returns `null` while
 * closed, so a panel mounted with `open=false` has no footer node when an
 * effect would first run — and an effect keyed on a stable id never re-runs
 * when the panel later opens. The reservation would silently never happen, in
 * exactly the closed-then-open flow every panel actually uses. React invokes a
 * callback ref on attach AND detach, so both edges are covered without
 * threading `open` through.
 *
 * Measuring beats hard-coding: the footer wraps at narrow widths and grows when
 * a validation summary appears, so a constant would be wrong exactly when the
 * bar is tallest and the collision is worst.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import { useActionBarStore } from '@/store/actionBarStore';

interface RegisterActionBarOptions {
  /** Fixed clearance between the viewport bottom and the bar itself. */
  bottomOffsetPx?: number;
}

export function useRegisterActionBar<T extends HTMLElement = HTMLDivElement>(
  { bottomOffsetPx = 0 }: RegisterActionBarOptions = {}
) {
  // useId keeps two instances of the same panel from clobbering each other's
  // entry — an id derived from the component name would not.
  const id = useId();
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback(
    (node: T | null) => {
      const { setHeight, unregister } = useActionBarStore.getState();

      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node) {
        unregister(id);
        return;
      }

      setHeight(id, node.getBoundingClientRect().height + bottomOffsetPx);

      // jsdom and older Safari have no ResizeObserver. The height published
      // above still stands, so a bar that never resizes is handled correctly
      // rather than failing closed and reserving nothing.
      if (typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (entry) setHeight(id, entry.contentRect.height + bottomOffsetPx);
      });
      observer.observe(node);
      observerRef.current = observer;
    },
    [bottomOffsetPx, id]
  );

  // Unmounting the component that owns the bar does not always detach the node
  // first, so release the reservation here too. Unregister is idempotent.
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      useActionBarStore.getState().unregister(id);
    },
    [id]
  );

  return setRef;
}
