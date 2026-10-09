import { useCallback, useEffect, useRef } from 'react';

/**
 * The catalog sits above the filters, Print button and preview, so below `lg` (where every
 * card stacks) picking a report would leave the secretary looking at the catalog with the
 * controls pages away. One Print button stays where it is; instead, selecting a report
 * (and arriving on a deep link that names one) moves focus to the controls region and
 * scrolls it into view, instantly when the user prefers reduced motion.
 */
export function useFocusReportControls(opts: { focusOnMount: boolean }) {
  const controlsRef = useRef<HTMLDivElement>(null);

  const focusControls = useCallback(() => {
    const el = controlsRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const { focusOnMount } = opts;
  useEffect(() => {
    if (focusOnMount) focusControls();
    // Mount only: a deep link names its report once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { controlsRef, focusControls };
}
