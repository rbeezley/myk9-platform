import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import type { ExplainerStep, Shot } from './lifecycleStories';

const MAX_W = { phone: '300px', tablet: '420px', desktop: '640px' } as const;

// Explainer slide over one screenshot: a highlight box and caption per step, cross-faded
// by opacity (no layout animation). Auto-advances only while on screen and not paused.
// INTENT: motion here teaches what the screen does; Pause/Next satisfy WCAG 2.2.2, and
// reduced motion starts paused (docs/plan-landing-lifecycle.md D8).
export function ScreenshotExplainer({
  shot,
  steps,
  intervalMs = 2600,
}: {
  shot: Shot;
  steps: readonly ExplainerStep[];
  intervalMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  // null = follow reduced motion (paused when it is on); a boolean is the viewer's own choice.
  const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
  const paused = pausedOverride ?? reducedMotion;
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.4,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const t = window.setInterval(() => setIndex(i => (i + 1) % steps.length), intervalMs);
    return () => window.clearInterval(t);
  }, [paused, visible, steps.length, intervalMs]);

  // Review Focus 7: a parent may swap in a shorter step list; never read past its end.
  const safeIndex = index % steps.length;
  const current = steps[safeIndex]!;
  return (
    <figure ref={ref} className="lc-explainer" style={{ maxWidth: MAX_W[shot.shape] }}>
      <div className="lc-explainer-frame">
        <img
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading="lazy"
          decoding="async"
        />
        {steps.map((s, i) => (
          <div
            key={i}
            aria-hidden="true"
            data-explainer-box
            data-active={i === safeIndex ? 'true' : 'false'}
            className={s.w === 0 ? 'lc-explainer-dim' : 'lc-explainer-box'}
            style={
              s.w === 0
                ? undefined
                : { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }
            }
          />
        ))}
        {current.badge && (
          <span aria-hidden="true" className="lc-explainer-badge" data-tone={current.badge.tone}>
            {current.badge.text}
          </span>
        )}
      </div>
      <figcaption className="lc-explainer-caption">
        <span className="lc-explainer-count">
          {safeIndex + 1} of {steps.length}
        </span>
        <span className="lc-explainer-text" aria-live={paused ? 'polite' : 'off'}>
          {current.caption}
        </span>
        <button
          type="button"
          className="lc-explainer-btn"
          onClick={() => setPausedOverride(!paused)}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="lc-explainer-btn"
          onClick={() => {
            setPausedOverride(true);
            setIndex(i => (i + 1) % steps.length);
          }}
        >
          Next
        </button>
      </figcaption>
    </figure>
  );
}
