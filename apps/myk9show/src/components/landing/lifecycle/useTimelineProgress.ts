import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

// Scroll progress for the lifecycle timeline.
// - `reached`: steps (from the top) whose dot is at or above the viewport's middle. It is read
//   from the dots' positions on scroll, resize and layout change, so it follows the reader both
//   ways and also an instant jump (End key, scrollbar drag, anchor) that skips past dots; an
//   IntersectionObserver would never report a dot that was never on screen.
// - `isRevealed`: a step's content rises in once, the first time 8% of it is visible.
// INTENT: progress and reveal carry meaning (where you are in the show); nothing here
// hijacks scroll, and reduced motion shows everything at once (docs/plan-landing-lifecycle.md D8).
export function useTimelineProgress(ids: readonly string[]) {
  const reducedMotion = useReducedMotion();
  const supported = typeof IntersectionObserver !== 'undefined';
  const [measured, setMeasured] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!supported) return;
    const reveal = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.08) {
            setRevealed(prev => ({ ...prev, [e.target.id]: true }));
            reveal.unobserve(e.target);
          }
        }
      },
      { threshold: [0, 0.08] }
    );
    for (const id of ids) {
      const row = document.getElementById(id);
      if (row) reveal.observe(row);
    }
    return () => reveal.disconnect();
  }, [ids, supported]);

  useEffect(() => {
    if (!supported) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const middle = window.innerHeight * 0.5;
      let count = 0;
      for (const id of ids) {
        const dot = document.getElementById(`${id}-dot`);
        if (!dot || dot.getBoundingClientRect().top > middle) break;
        count += 1;
      }
      setMeasured(prev => (prev === count ? prev : count));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Content above the reader can change height with no scroll (images, the audience switch).
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    resize?.observe(document.documentElement);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resize?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids, supported]);

  const reached = supported ? Math.min(measured, ids.length) : ids.length;

  const isRevealed = useCallback(
    (id: string) => !supported || reducedMotion || !!revealed[id],
    [supported, reducedMotion, revealed]
  );

  return { reached, isRevealed };
}
