import { describe, expect, it } from 'vitest';
import {
  PLATFORM_BASELINE_LEAD_MS,
  PLATFORM_DRAIN_GRACE_MS,
  platformSamplingWindow,
} from './loadPlatformWindow';

const START = 1_800_000_000_000;
const DURATION = 10 * 60 * 1_000;

describe('platform sampling window', () => {
  it('waits so the baseline snapshot lands before load starts', () => {
    const window = platformSamplingWindow({
      startAtMs: START,
      durationMs: DURATION,
      nowMs: START - 5 * 60 * 1_000,
    });

    // Baseline must precede the start, not merely be "early".
    expect(window.baselineDelayMs).toBe(5 * 60 * 1_000 - PLATFORM_BASELINE_LEAD_MS);
    expect(START - 5 * 60 * 1_000 + window.baselineDelayMs).toBeLessThan(START);
  });

  it('keeps sampling past the scenario so draining work is still covered', () => {
    const window = platformSamplingWindow({
      startAtMs: START,
      durationMs: DURATION,
      nowMs: START - 60_000,
    });

    expect(window.stopAtMs).toBe(START + DURATION + PLATFORM_DRAIN_GRACE_MS);
    expect(window.stopAtMs).toBeGreaterThan(START + DURATION);
  });

  it('does not wait when the baseline moment has already arrived', () => {
    const window = platformSamplingWindow({
      startAtMs: START,
      durationMs: DURATION,
      nowMs: START - 1_000,
    });

    expect(window.baselineDelayMs).toBe(0);
  });

  it('refuses a baseline taken after load already started', () => {
    expect(() =>
      platformSamplingWindow({ startAtMs: START, durationMs: DURATION, nowMs: START + 1 })
    ).toThrow('cannot take a baseline after load has started');
  });

  it('refuses a window that missed the load entirely', () => {
    expect(() =>
      platformSamplingWindow({
        startAtMs: START,
        durationMs: DURATION,
        nowMs: START + DURATION + PLATFORM_DRAIN_GRACE_MS,
      })
    ).toThrow('missed the synchronized load window');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid start %p', startAtMs => {
    expect(() => platformSamplingWindow({ startAtMs, durationMs: DURATION, nowMs: 1 })).toThrow(
      'valid synchronized start'
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid duration %p', durationMs => {
    expect(() =>
      platformSamplingWindow({ startAtMs: START, durationMs, nowMs: START - 60_000 })
    ).toThrow('positive scenario duration');
  });
});
