import { describe, expect, it } from 'vitest';
import { initialSceneState, reduceScene } from '../sceneState';
import type { SceneConfig, SceneState } from '../sceneState';
import { STAND_IN_ENTRIES_SCENE } from './sceneStandIn';

const { frames } = STAND_IN_ENTRIES_SCENE;
const autoplay: SceneConfig = { frames, mode: 'autoplay', reducedMotion: false };
const step: SceneConfig = { frames, mode: 'step', reducedMotion: false };
const reduced: SceneConfig = { frames, mode: 'autoplay', reducedMotion: true };

describe('initialSceneState', () => {
  it('autoplay starts on frame 0 and playing', () => {
    expect(initialSceneState(autoplay)).toEqual({ frame: 0, elapsed: 0, playing: true });
  });
  it("step-through rests on line 1's finished frame, not playing", () => {
    expect(initialSceneState(step)).toEqual({ frame: 0, elapsed: 0, playing: false });
    // A first line that owns two frames rests on the second.
    const twoFrameStart = [{ ...frames[0]! }, { ...frames[0]! }, ...frames.slice(1)];
    expect(initialSceneState({ ...step, frames: twoFrameStart }).frame).toBe(1);
  });
  it('reduced motion rests on the finished frame, not playing', () => {
    expect(initialSceneState(reduced)).toEqual({
      frame: frames.length - 1,
      elapsed: 0,
      playing: false,
    });
  });
});

describe('autoplay', () => {
  it('advances when a frame runs out and loops from the last', () => {
    let s = initialSceneState(autoplay);
    s = reduceScene(s, { type: 'tick', ms: 3999 }, autoplay);
    expect(s).toMatchObject({ frame: 0, elapsed: 3999 });
    s = reduceScene(s, { type: 'tick', ms: 1 }, autoplay);
    expect(s).toMatchObject({ frame: 1, elapsed: 0 });
    s = { frame: frames.length - 1, elapsed: 4599, playing: true };
    s = reduceScene(s, { type: 'tick', ms: 1 }, autoplay);
    expect(s.frame).toBe(0);
  });

  it('pause stops ticks and play resumes them', () => {
    let s = reduceScene(initialSceneState(autoplay), { type: 'pause' }, autoplay);
    expect(s.playing).toBe(false);
    expect(reduceScene(s, { type: 'tick', ms: 99999 }, autoplay)).toEqual(s);
    s = reduceScene(s, { type: 'play' }, autoplay);
    expect(s.playing).toBe(true);
  });

  it('jump goes to the first frame of the line and keeps playing', () => {
    const s: SceneState = { frame: 5, elapsed: 1200, playing: false };
    expect(reduceScene(s, { type: 'jump', line: 3 }, autoplay)).toEqual({
      frame: 3,
      elapsed: 0,
      playing: true,
    });
  });
});

describe('reduced motion', () => {
  it("never plays, and jump shows the line's last frame", () => {
    const s = initialSceneState(reduced);
    expect(reduceScene(s, { type: 'play' }, reduced).playing).toBe(false);
    expect(reduceScene(s, { type: 'tick', ms: 99999 }, reduced)).toEqual(s);
    expect(reduceScene(s, { type: 'jump', line: 4 }, reduced)).toEqual({
      frame: 5,
      elapsed: 0,
      playing: false,
    });
    expect(reduceScene(s, { type: 'jump', line: 1 }, reduced).frame).toBe(1);
  });
});

describe('step-through', () => {
  it('ignores ticks and play while resting', () => {
    const s = initialSceneState(step);
    expect(reduceScene(s, { type: 'tick', ms: 99999 }, step)).toEqual(s);
    expect(reduceScene(s, { type: 'play' }, step)).toEqual(s);
  });

  it('Next and Back move one numbered line and stop at the ends', () => {
    let s = initialSceneState(step);
    s = reduceScene(s, { type: 'back' }, step);
    expect(s.frame).toBe(0);
    s = reduceScene(s, { type: 'next' }, step);
    expect(s).toEqual({ frame: 1, elapsed: 0, playing: false });
    s = reduceScene({ ...s, frame: frames.length - 1 }, { type: 'next' }, step);
    expect(s.frame).toBe(frames.length - 1);
    // Back from line 5 (frames 4 and 5) replays line 4, not the frame before.
    s = reduceScene(s, { type: 'back' }, step);
    expect(s.frame).toBe(3);
  });

  it('plays a line that owns several frames to its end, then waits', () => {
    let s: SceneState = { frame: 3, elapsed: 0, playing: false };
    s = reduceScene(s, { type: 'next' }, step);
    expect(s).toEqual({ frame: 4, elapsed: 0, playing: true });
    s = reduceScene(s, { type: 'tick', ms: 3399 }, step);
    expect(s.frame).toBe(4);
    s = reduceScene(s, { type: 'tick', ms: 1 }, step);
    expect(s).toEqual({ frame: 5, elapsed: 0, playing: false });
    expect(reduceScene(s, { type: 'tick', ms: 99999 }, step)).toEqual(s);
  });

  it("under reduced motion Next shows the next line's finished frame and nothing plays", () => {
    const cfg: SceneConfig = { frames, mode: 'step', reducedMotion: true };
    const s = reduceScene({ frame: 3, elapsed: 0, playing: false }, { type: 'next' }, cfg);
    expect(s).toEqual({ frame: 5, elapsed: 0, playing: false });
  });

  it('jump goes to the line and stays put', () => {
    expect(reduceScene(initialSceneState(step), { type: 'jump', line: 2 }, step)).toEqual({
      frame: 2,
      elapsed: 0,
      playing: false,
    });
  });
});
