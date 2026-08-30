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
  /**
   * Called with the bar's measured height (0 once it detaches). A docked bar
   * covers the bottom of the PAGE, not just the toaster, so the page has to
   * reserve the same space in normal flow or the last thing on it — pagination,
   * a footer row — sits underneath and cannot be reached. The registry itself
   * cannot serve that: overlay footers (dialogs, slide-over panels) register
   * there too, and padding the page behind an open modal is not wanted.
   */
  onHeightChange?: (height: number) => void;
}

export function useRegisterActionBar<T extends HTMLElement = HTMLDivElement>(
  { bottomOffsetPx = 0, onHeightChange }: RegisterActionBarOptions = {}
) {
  // useId keeps two instances of the same panel from clobbering each other's
  // entry — an id derived from the component name would not.
  const id = useId();
  const observerRef = useRef<ResizeObserver | null>(null);

  // Held in a ref so an inline callback does not change `setRef`'s identity —
  // a new ref callback every render would detach and re-attach the node, i.e.
  // unregister/re-register the bar on every keystroke elsewhere on the page.
  const onHeightChangeRef = useRef(onHeightChange);
  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  const setRef = useCallback(
    (node: T | null) => {
      const { setHeight, unregister } = useActionBarStore.getState();

      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node) {
        unregister(id);
        onHeightChangeRef.current?.(0);
        return;
      }

      const measured = node.getBoundingClientRect().height + bottomOffsetPx;
      setHeight(id, measured);
      onHeightChangeRef.current?.(Math.max(0, Math.round(measured)));

      // jsdom and older Safari have no ResizeObserver. The height published
      // above still stands, so a bar that never resizes is handled correctly
      // rather than failing closed and reserving nothing.
      if (typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        // `contentRect` is the CONTENT box — it excludes the bar's padding and
        // border. Every bar here is `p-3 border-t`, so contentRect under-reports
        // by ~25px and the first resize would silently shrink the reservation the
        // initial getBoundingClientRect measurement got right. Measured on /dogs:
        // 44px reported against a 69px bar.
        const measured =
          entry.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height;
        const next = measured + bottomOffsetPx;
        setHeight(id, next);
        onHeightChangeRef.current?.(Math.max(0, Math.round(next)));
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
      onHeightChangeRef.current?.(0);
    },
    [id]
  );

  return setRef;
}
