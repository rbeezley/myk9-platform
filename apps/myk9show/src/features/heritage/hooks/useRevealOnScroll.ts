import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Single-use IntersectionObserver hook. Attach the returned `ref` to an
 * element; when ≥ `threshold` of it enters the viewport once, `revealed`
 * flips to `true` and stays. Used by ornament rules, section headings,
 * capacity bars, journey timelines.
 *
 * Behavior under reduced-motion: returns `revealed = true` immediately and
 * never observes — components render their settled end-state on mount.
 *
 * Behavior in non-browser (SSR / vitest) environments without
 * `IntersectionObserver`: also returns `revealed = true` immediately. Better
 * to render the visible state in tests than to leave reveal-targets blank.
 */
export function useRevealOnScroll<T extends HTMLElement = HTMLElement>(
  threshold = 0.18
): { ref: React.RefObject<T | null>; revealed: boolean } {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setRevealed(true);
      return;
    }
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, threshold]);

  return { ref, revealed };
}
