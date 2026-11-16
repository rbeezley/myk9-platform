import { firstFrameOfLine, lastFrameOfLine } from './sceneFrames';
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

/** Autoplay under reduced motion rests on the finished frame; everything else starts at frame 0. */
export function initialSceneState({ frames, mode, reducedMotion }: SceneConfig): SceneState {
  const rest = mode === 'autoplay' && reducedMotion;
  return {
    frame: rest ? Math.max(0, frames.length - 1) : 0,
    elapsed: 0,
    playing: mode === 'autoplay' && !reducedMotion,
  };
}

export function reduceScene(state: SceneState, action: SceneAction, cfg: SceneConfig): SceneState {
  const last = cfg.frames.length - 1;
  if (last < 0) return state;
  const canPlay = cfg.mode === 'autoplay' && !cfg.reducedMotion;
  switch (action.type) {
    case 'tick': {
      if (!state.playing || !canPlay) return state;
      const elapsed = state.elapsed + action.ms;
      if (elapsed < cfg.frames[state.frame]!.ms) return { ...state, elapsed };
      return { ...state, frame: state.frame >= last ? 0 : state.frame + 1, elapsed: 0 };
    }
    case 'play':
      return canPlay ? { ...state, playing: true } : state;
    case 'pause':
      return { ...state, playing: false };
    case 'jump': {
      // Reduced motion shows the line's finished frame; otherwise the line starts over.
      const frame = cfg.reducedMotion
        ? lastFrameOfLine(cfg.frames, action.line)
        : firstFrameOfLine(cfg.frames, action.line);
      return { frame, elapsed: 0, playing: canPlay };
    }
    case 'next':
      return { ...state, frame: Math.min(last, state.frame + 1), elapsed: 0, playing: false };
    case 'back':
      return { ...state, frame: Math.max(0, state.frame - 1), elapsed: 0, playing: false };
  }
}
