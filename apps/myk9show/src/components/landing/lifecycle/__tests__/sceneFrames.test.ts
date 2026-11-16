import { describe, expect, it } from 'vitest';
import {
  firstFrameOfLine,
  lastFrameOfLine,
  lineProgress,
  ringStyle,
  sceneDevices,
  shotStyle,
} from '../sceneFrames';
import { STAND_IN_ENTRIES_SCENE } from './sceneStandIn';

const { frames } = STAND_IN_ENTRIES_SCENE;

describe('shotStyle and ringStyle', () => {
  it('turns a camera region on a 1440x900 capture into percentages', () => {
    const camera = { x: 140, y: 440, w: 720, h: 432 };
    expect(shotStyle({ width: 1440, height: 900 }, camera)).toEqual({
      width: '200%',
      left: '-19.444%',
      top: '-101.852%',
    });
    expect(ringStyle({ x: 151, y: 525, w: 667, h: 105 }, camera)).toEqual({
      left: '1.528%',
      top: '19.676%',
      width: '92.639%',
      height: '24.306%',
    });
  });

  it('puts a camera that shows the whole capture at 100% and 0%', () => {
    const camera = { x: 0, y: 0, w: 390, h: 844 };
    expect(shotStyle({ width: 390, height: 844 }, camera)).toEqual({
      width: '100%',
      left: '0%',
      top: '0%',
    });
    expect(ringStyle({ x: 0, y: 0, w: 390, h: 844 }, camera)).toEqual({
      left: '0%',
      top: '0%',
      width: '100%',
      height: '100%',
    });
  });

  it('zooms: a camera half the page width doubles the capture and offsets it', () => {
    const camera = { x: 100, y: 50, w: 200, h: 100 };
    expect(shotStyle({ width: 400, height: 200 }, camera)).toEqual({
      width: '200%',
      left: '-50%',
      top: '-50%',
    });
    expect(ringStyle({ x: 150, y: 75, w: 100, h: 50 }, camera)).toEqual({
      left: '25%',
      top: '25%',
      width: '50%',
      height: '50%',
    });
  });
});

describe('line to frame mapping', () => {
  it('finds the first and last frame a line owns', () => {
    expect(firstFrameOfLine(frames, 0)).toBe(0);
    expect(firstFrameOfLine(frames, 4)).toBe(4);
    expect(lastFrameOfLine(frames, 4)).toBe(5);
    expect(lastFrameOfLine(frames, 2)).toBe(2);
  });

  it('falls back to frame 0 for a line that owns nothing', () => {
    expect(firstFrameOfLine(frames, 9)).toBe(0);
    expect(lastFrameOfLine(frames, 9)).toBe(0);
  });
});

describe('sceneDevices', () => {
  it('lists the devices a scene has, desk first', () => {
    const { desk, phone, ...rest } = STAND_IN_ENTRIES_SCENE;
    expect(sceneDevices(STAND_IN_ENTRIES_SCENE)).toEqual(['desk', 'phone']);
    expect(sceneDevices({ ...rest, phone })).toEqual(['phone']);
    expect(sceneDevices({ ...rest, desk })).toEqual(['desk']);
  });
});

describe('lineProgress', () => {
  it('counts earlier lines as done and later lines as not started', () => {
    expect(lineProgress(frames, 0, 2, 0, true)).toBe(1);
    expect(lineProgress(frames, 3, 2, 0, true)).toBe(0);
  });

  it('measures time across the frames a line owns', () => {
    // Line 4 owns 3400ms then 4600ms: 8000ms in all.
    expect(lineProgress(frames, 4, 4, 0, true)).toBe(0);
    expect(lineProgress(frames, 4, 4, 2000, true)).toBe(0.25);
    expect(lineProgress(frames, 4, 5, 0, true)).toBe(3400 / 8000);
  });

  it('measures frames when nothing is timed (step-through)', () => {
    expect(lineProgress(frames, 4, 4, 0, false)).toBe(0.5);
    expect(lineProgress(frames, 4, 5, 0, false)).toBe(1);
  });
});
