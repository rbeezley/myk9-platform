import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetShowNudgeGate,
  scheduleShowNudge,
  setShowNudgeRandom,
  SHOW_NUDGE_MIN_GAP_MS,
} from './showNudgeGate';
import type { ShowChangeTable } from './showChangeSignal';

let now = 0;
let nowSpy: ReturnType<typeof vi.spyOn>;

/** Advance the mocked monotonic clock and the fake timers together. */
const advance = (ms: number) => {
  now += ms;
  vi.advanceTimersByTime(ms);
};
const tablesOf = (...t: ShowChangeTable[]) => new Set<ShowChangeTable>(t);

beforeEach(() => {
  vi.useFakeTimers();
  now = 10_000;
  nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);
  resetShowNudgeGate();
  setShowNudgeRandom(() => 0);
});

afterEach(() => {
  resetShowNudgeGate();
  nowSpy.mockRestore();
  vi.useRealTimers();
});

describe('showNudgeGate', () => {
  it('fires the first nudge after only the device jitter', () => {
    setShowNudgeRandom(() => 0.5);
    const fire = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(1_499);
    expect(fire).not.toHaveBeenCalled();
    advance(1);
    expect(fire).toHaveBeenCalledWith(tablesOf('entries'));
  });

  it('coalesces nudges inside the gap into one trailing fire with the table union', () => {
    const fire = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(0);
    expect(fire).toHaveBeenCalledTimes(1);

    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    scheduleShowNudge('show-1', tablesOf('classes'), fire);
    scheduleShowNudge('show-1', tablesOf('paperwork_prints'), fire);
    advance(SHOW_NUDGE_MIN_GAP_MS - 1);
    expect(fire).toHaveBeenCalledTimes(1);
    advance(1);
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire).toHaveBeenLastCalledWith(tablesOf('entries', 'classes', 'paperwork_prints'));
  });

  it('keeps an independent gap per show', () => {
    const fire1 = vi.fn();
    const fire2 = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire1);
    advance(0);
    advance(1_000);
    scheduleShowNudge('show-1', tablesOf('entries'), fire1);
    scheduleShowNudge('show-2', tablesOf('entries'), fire2);
    advance(0);
    // show-2 has never fired, so it is not held by show-1's gap.
    expect(fire2).toHaveBeenCalledTimes(1);
    expect(fire1).toHaveBeenCalledTimes(1);
    advance(SHOW_NUDGE_MIN_GAP_MS - 1_000);
    expect(fire1).toHaveBeenCalledTimes(2);
  });

  it('draws the device jitter once and shares it across shows', () => {
    const rng = vi.fn().mockReturnValueOnce(0.1).mockReturnValue(0.9);
    setShowNudgeRandom(rng);
    const fire1 = vi.fn();
    const fire2 = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire1);
    scheduleShowNudge('show-2', tablesOf('entries'), fire2);
    advance(299);
    expect(fire1).not.toHaveBeenCalled();
    advance(1);
    expect(fire1).toHaveBeenCalledTimes(1);
    expect(fire2).toHaveBeenCalledTimes(1);

    scheduleShowNudge('show-1', tablesOf('entries'), fire1);
    advance(SHOW_NUDGE_MIN_GAP_MS + 299);
    expect(fire1).toHaveBeenCalledTimes(1);
    advance(1);
    expect(fire1).toHaveBeenCalledTimes(2);
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('measures the gap on the monotonic clock, not the wall clock', () => {
    const fire = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(0);
    // A wall-clock jump of a day changes nothing: only performance.now() counts.
    vi.setSystemTime(Date.now() + 86_400_000);
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(SHOW_NUDGE_MIN_GAP_MS - 1);
    expect(fire).toHaveBeenCalledTimes(1);
    advance(1);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('never waits longer than the gap if the monotonic clock reads backwards', () => {
    const fire = vi.fn();
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(0);
    now -= 1_000_000;
    scheduleShowNudge('show-1', tablesOf('entries'), fire);
    vi.advanceTimersByTime(SHOW_NUDGE_MIN_GAP_MS);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('twenty nudges while the tab is hidden fire once when the timer lands', () => {
    // Scoped passes skip the untargeted scheduler's canRun check, so the gate's
    // own one-pending-set-per-show coalescing is what bounds a hidden tab.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const fire = vi.fn();
    for (let i = 0; i < 20; i++) scheduleShowNudge('show-1', tablesOf('entries'), fire);
    advance(SHOW_NUDGE_MIN_GAP_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    advance(60_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
