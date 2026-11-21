import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import { SceneDevice } from './SceneDevice';
import { SceneCaption } from './SceneCaption';
import { SceneStoryboard } from './SceneStoryboard';
import { SceneArrow, SceneTabs } from './SceneTabs';
import { initialSceneState, reduceScene } from './sceneState';
import { sceneDevices } from './sceneFrames';
import type { SceneAction, SceneState } from './sceneState';
import type { DeviceId, SceneMode, TimelineSceneData } from './sceneFrames';
import './timelineScene.css';
import './sceneControls.css';

const TICK_MS = 100;

// One scene as a captioned stage: the secretary's screen and the exhibitor's phone side by side
// (stacked, lead first, on a narrow container) or one device alone, real captures that zoom to the
// part each numbered line is about, with a ring on the control in question. Under the devices one
// caption says the current line; under it a tab per line, with Back and Next beside the caption.
// Autoplay plays itself (only while on screen and the tab is visible) and loops; step-through moves
// only when the reader presses Next or Back, one numbered line per press. Takes data as props: no
// auth, router, replication or app state. Its one app import is the shared reduced-motion hook.
// INTENT: motion here shows what the other audience is doing at the same moment. Pause, tabs
// (jump) and reduced motion keep it WCAG 2.2.2 safe: reduced motion draws every line at once as a
// storyboard with nothing moving, and nothing hijacks scroll (docs/plan-landing-animated-timeline.md).
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
  const current = lines[line];

  // A press on Back or Next takes the reader's hands to the scene: autoplay pauses where it lands.
  const step = (type: 'next' | 'back') => {
    dispatch({ type });
    if (!stepping) dispatch({ type: 'pause' });
  };

  const root = {
    ref,
    className: 'tl-scene',
    'data-lead': lead,
    'data-solo': solo ? 'true' : undefined,
    'aria-label': scene.name,
  } as const;

  if (reducedMotion) {
    return (
      <section {...root}>
        <SceneStoryboard scene={scene} />
      </section>
    );
  }

  return (
    <section {...root}>
      <div className="tl-scene-stage">
        {devices.map(kind => {
          const data = scene[kind];
          const view = f[kind];
          if (!data || !view) return null;
          const dimmed = !solo && f.subject !== 'both' && f.subject !== kind;
          return <SceneDevice key={kind} kind={kind} data={data} view={view} dimmed={dimmed} />;
        })}
      </div>
      <div className="tl-scene-panel">
        {current && (
          <SceneCaption
            line={current}
            index={line}
            total={lines.length}
            announce={!state.playing}
          />
        )}
        <SceneArrow dir="prev" disabled={atStart} onPress={() => !atStart && step('back')} />
        <SceneArrow dir="next" disabled={atEnd} onPress={() => !atEnd && step('next')} />
        <SceneTabs lines={lines} current={line} onJump={n => dispatch({ type: 'jump', line: n })} />
        {!stepping && (
          <button
            type="button"
            className="tl-scene-btn"
            onClick={() => dispatch({ type: state.playing ? 'pause' : 'play' })}
          >
            {state.playing ? 'Pause' : 'Play'}
          </button>
        )}
      </div>
    </section>
  );
}
