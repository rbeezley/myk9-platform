import { firstFrameOfLine, lastFrameOfLine, restFrameOfLine } from './sceneFrames';
import type { SceneFrame, SceneMode } from './sceneFrames';

// The play / pause / jump / next / back state machine for TimelineScene, kept free of React so
// every transition is a plain function call in a test.

export type SceneState = { frame: number; elapsed: number; playing: boolean };

export type SceneConfig = {
  frames: readonly SceneFrame[];
  mode: SceneMode;
  reducedMotion: boolean;
};

export type SceneAction =
  | { type: 'tick'; ms: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'jump'; line: number }
  | { type: 'next' }
  | { type: 'back' };

/**
 * Autoplay starts on frame 0 and plays. Step-through rests on line 1's finished frame, so the
 * first Next opens line 2. Autoplay under reduced motion rests on the scene's finished frame.
 */
export function initialSceneState({ frames, mode, reducedMotion }: SceneConfig): SceneState {
  const autoplay = mode === 'autoplay';
  const rest = autoplay
    ? reducedMotion
      ? Math.max(0, frames.length - 1)
      : 0
    : lastFrameOfLine(frames, 0);
  return { frame: rest, elapsed: 0, playing: autoplay && !reducedMotion };
}

/**
 * Landing on a line. Reduced motion shows the frame that stands for it. Otherwise the line starts over:
 * autoplay keeps going, and step-through plays the line's own frames and then waits.
 */
function arrive(cfg: SceneConfig, line: number): SceneState {
  const first = firstFrameOfLine(cfg.frames, line);
  const last = lastFrameOfLine(cfg.frames, line);
  if (cfg.reducedMotion) {
    return { frame: restFrameOfLine(cfg.frames, line), elapsed: 0, playing: false };
  }
  return { frame: first, elapsed: 0, playing: cfg.mode === 'autoplay' || first !== last };
}

export function reduceScene(state: SceneState, action: SceneAction, cfg: SceneConfig): SceneState {
  const last = cfg.frames.length - 1;
  if (last < 0) return state;
  const line = cfg.frames[state.frame]?.line ?? 0;
  switch (action.type) {
    case 'tick': {
      if (!state.playing || cfg.reducedMotion) return state;
      const elapsed = state.elapsed + action.ms;
      if (elapsed < cfg.frames[state.frame]!.ms) return { ...state, elapsed };
      if (cfg.mode === 'autoplay') {
        return { ...state, frame: state.frame >= last ? 0 : state.frame + 1, elapsed: 0 };
      }
      // Step-through: play to the end of this line, never into the next.
      const end = lastFrameOfLine(cfg.frames, line);
      const frame = Math.min(end, state.frame + 1);
      return { frame, elapsed: 0, playing: frame < end };
    }
    case 'play':
      return cfg.mode === 'autoplay' && !cfg.reducedMotion ? { ...state, playing: true } : state;
    case 'pause':
      return { ...state, playing: false };
    case 'jump':
      return arrive(cfg, action.line);
    case 'next':
    case 'back': {
      // One press, one numbered line. The ends hold still.
      const target = action.type === 'next' ? line + 1 : line - 1;
      if (target < 0 || target > cfg.frames[last]!.line) return state;
      return arrive(cfg, target);
    }
  }
}
