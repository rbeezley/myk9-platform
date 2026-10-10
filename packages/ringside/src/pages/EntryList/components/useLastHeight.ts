import { useCallback, useRef, useState } from 'react';

/**
 * Remembers the last rendered height of whatever element the returned ref is
 * attached to, and keeps it after that element unmounts.
 *
 * The entry list swaps the "In the ring" hero card for a "Ring is clear"
 * placeholder each time a dog leaves the ring, and back when the next dog goes
 * in. Hero height depends on the dog (name, breed and handler wrapping) and
 * the breakpoint, so no fixed placeholder height matches it. Sizing the
 * placeholder to the hero it replaced keeps the list below from shifting
 * (owner report, MYK9-1086). `null` until something has been measured, or
 * where ResizeObserver does not exist.
 */
export function useLastHeight<T extends HTMLElement>(): [(el: T | null) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = Math.round(box ? box.blockSize : el.getBoundingClientRect().height);
      if (next > 0) setHeight(next);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return [ref, height];
}
