import { useEffect, useState } from 'react';

/**
 * Subscribes to the `(prefers-reduced-motion: reduce)` media query.
 *
 * Returns `true` when the user has requested reduced motion. Heritage
 * animations (ornament rule reveal, capacity bar fill, journey stagger,
 * hero fades) all gate on this so motion-sensitive visitors get the static
 * end-state immediately.
 *
 * Subscribes to changes — flipping the OS setting flips the value live, so
 * components rerender without a refresh.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  return reduced;
}
