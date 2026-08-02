/**
 * Register a sticky action bar so overlays can stay clear of it.
 *
 * Returns a ref to attach to the bar's outermost element. The bar's measured
 * height is published to the action-bar registry while it is mounted and
 * withdrawn when it unmounts.
 *
 * Measuring beats hard-coding: the footer wraps at narrow widths and grows when
 * a validation summary appears, so a constant would be wrong exactly when the
 * bar is tallest and the collision is worst.
 */
import { useEffect, useId, useRef } from 'react';
import { useActionBarStore } from '@/store/actionBarStore';

export function useRegisterActionBar<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  // useId keeps two instances of the same panel from clobbering each other's
  // entry — an id derived from the component name would not.
  const id = useId();

  useEffect(() => {
    const element = ref.current;
    const { setHeight, unregister } = useActionBarStore.getState();

    if (!element) {
      unregister(id);
      return;
    }

    // jsdom and older Safari have no ResizeObserver. Publish the height once so
    // the offset is still correct for a bar that never changes size, rather
    // than failing closed and reserving nothing.
    if (typeof ResizeObserver === 'undefined') {
      setHeight(id, element.getBoundingClientRect().height);
      return () => unregister(id);
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setHeight(id, entry.contentRect.height);
    });

    setHeight(id, element.getBoundingClientRect().height);
    observer.observe(element);

    return () => {
      observer.disconnect();
      unregister(id);
    };
  }, [id]);

  return ref;
}
