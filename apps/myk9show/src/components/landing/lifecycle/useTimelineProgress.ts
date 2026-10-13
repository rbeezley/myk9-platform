import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

// Scroll progress for the lifecycle timeline.
// - `reached`: steps (from the top) whose dot is at or above the viewport's middle. It follows
//   the reader both ways, so dots and line segments un-fill when they scroll back up.
// - `isRevealed`: a step's content rises in once, the first time 8% of it is visible.
// INTENT: progress and reveal carry meaning (where you are in the show); nothing here
// hijacks scroll, and reduced motion shows everything at once (docs/plan-landing-lifecycle.md D8).
export function useTimelineProgress(ids: readonly string[]) {
  const reducedMotion = useReducedMotion();
  const supported = typeof IntersectionObserver !== 'undefined';
  const [reachedById, setReachedById] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!supported) return;
    const progress = new IntersectionObserver(
      entries => {
        setReachedById(prev => {
          const next = { ...prev };
          for (const e of entries) {
            const id = e.target.id.replace(/-dot$/, '');
            next[id] = e.isIntersecting || e.boundingClientRect.top < 0;
          }
          return next;
        });
      },
      { rootMargin: '0px 0px -50% 0px', threshold: 0 }
    );
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
      const dot = document.getElementById(`${id}-dot`);
      const row = document.getElementById(id);
      if (dot) progress.observe(dot);
      if (row) reveal.observe(row);
    }
    return () => {
      progress.disconnect();
      reveal.disconnect();
    };
  }, [ids, supported]);

  // Count from the top: a step counts only if every step above it is reached too.
  let reached = 0;
  if (!supported) reached = ids.length;
  else
    for (const id of ids)
      if (reachedById[id]) reached += 1;
      else break;

  const isRevealed = useCallback(
    (id: string) => !supported || reducedMotion || !!revealed[id],
    [supported, reducedMotion, revealed]
  );

  return { reached, isRevealed };
}
