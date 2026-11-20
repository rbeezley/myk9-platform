import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import { SceneDevice } from './SceneDevice';
import { SceneLines } from './SceneLines';
import { initialSceneState, reduceScene } from './sceneState';
import { sceneDevices } from './sceneFrames';
import type { SceneAction, SceneState } from './sceneState';
import type { DeviceId, SceneMode, TimelineSceneData } from './sceneFrames';
import './timelineScene.css';

const TICK_MS = 100;

// One scene: the secretary's screen and the exhibitor's phone side by side (or one device
// alone, shown larger), real captures that zoom to the part each numbered line is about, with a
// ring on the control in question. Autoplay plays itself (only while on screen and the tab is
// visible) and loops; step-through moves only when the reader presses Next or Back, one numbered
// line per press. Takes data as props: no auth, router,
// replication or app state. Its one app import is the shared reduced-motion hook.
// Motion here shows what the other audience is doing at the same moment. Pause, jump and
// reduced motion keep it WCAG 2.2.2 safe, and nothing hijacks scroll (docs/plan-landing-animated-timeline.md).
export function TimelineScene({
  scene,
  lead,
  mode = 'autoplay',
}: {
  scene: TimelineSceneData;
  /** The device that leads the layout: the desk for clubs, the phone for exhibitors. */
  lead: DeviceId;
  mode?: SceneMode;
}) {
  const reducedMotion = useReducedMotion();
  const { frames, lines } = scene;

  const [state, setState] = useState<SceneState>(() =>
    initialSceneState({ frames, mode, reducedMotion })
  );
  // Flipping reduced motion, the mode or the frame list resets to that mode's resting state.
  const [seen, setSeen] = useState({ frames, mode, reducedMotion });
  if (seen.frames !== frames || seen.mode !== mode || seen.reducedMotion !== reducedMotion) {
    setSeen({ frames, mode, reducedMotion });
    setState(initialSceneState({ frames, mode, reducedMotion }));
  }
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );
  const ref = useRef<HTMLElement>(null);

  const dispatch = useCallback(
    (action: SceneAction) => setState(s => reduceScene(s, action, { frames, mode, reducedMotion })),
    [frames, mode, reducedMotion]
  );

  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), {
      threshold: 0.4,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const running = state.playing && inView && pageVisible && !reducedMotion;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => dispatch({ type: 'tick', ms: TICK_MS }), TICK_MS);
    return () => window.clearInterval(t);
  }, [running, dispatch]);

  if (frames.length === 0) return null;
  const frame = Math.min(state.frame, frames.length - 1);
  const f = frames[frame]!;
  const line = f.line;
  const stepping = mode === 'step';
  const atStart = line === 0;
  const atEnd = line === frames[frames.length - 1]!.line;
  const devices = sceneDevices(scene);
  const solo = devices.length === 1;
  const paused = !state.playing && !stepping && !reducedMotion;

  return (
    <section
      ref={ref}
      className="tl-scene"
      data-lead={lead}
      data-mode={mode}
      data-solo={solo ? 'true' : undefined}
      aria-label={scene.name}
    >
      <div className="tl-scene-grid">
        <div className="tl-scene-words">
          <SceneLines
            lines={lines}
            frames={frames}
            frame={frame}
            elapsed={state.elapsed}
            timed={!stepping}
            onJump={n => dispatch({ type: 'jump', line: n })}
          />
          <div className="tl-scene-controls">
            {stepping ? (
              <>
                <button
                  type="button"
                  className="tl-scene-btn"
                  aria-disabled={atStart}
                  onClick={() => dispatch({ type: 'back' })}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="tl-scene-btn"
                  aria-disabled={atEnd}
                  onClick={() => dispatch({ type: 'next' })}
                >
                  Next
                </button>
              </>
            ) : reducedMotion ? null : (
              <button
                type="button"
                className="tl-scene-btn"
                onClick={() => dispatch({ type: state.playing ? 'pause' : 'play' })}
              >
                {state.playing ? 'Pause' : 'Play'}
              </button>
            )}
            <span className="tl-scene-status" role="status" aria-live="polite">
              {stepping || paused
                ? `${stepping ? 'Step' : 'Paused on line'} ${line + 1} of ${lines.length}`
                : ''}
            </span>
          </div>
        </div>
        <div className="tl-scene-stage">
          {devices.map(kind => {
            const data = scene[kind];
            const view = f[kind];
            if (!data || !view) return null;
            const dimmed = !solo && f.subject !== 'both' && f.subject !== kind;
            return <SceneDevice key={kind} kind={kind} data={data} view={view} dimmed={dimmed} />;
          })}
        </div>
      </div>
    </section>
  );
}
