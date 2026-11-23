import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

// Reveal-on-scroll for the lifecycle timeline: a step's content rises in once, the first
// time 8% of it is visible.
// INTENT: the reveal only eases a step in; nothing here hijacks scroll, and reduced motion
// shows everything at once (docs/plan-landing-lifecycle.md D8). The numbered rail and its
// fill-on-scroll progress were removed on purpose (owner, 2026-11-20, MYK9-2322).
export function useTimelineProgress(ids: readonly string[]) {
  const reducedMotion = useReducedMotion();
  const supported = typeof IntersectionObserver !== 'undefined';
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

  const isRevealed = useCallback(
    (id: string) => !supported || reducedMotion || !!revealed[id],
    [supported, reducedMotion, revealed]
  );

  return { isRevealed };
}
