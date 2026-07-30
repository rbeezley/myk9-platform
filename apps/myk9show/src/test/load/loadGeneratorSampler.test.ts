import { describe, expect, it } from 'vitest';
import {
  assessGeneratorShard,
  buildGeneratorShardObservation,
  calculateHostCpuPercent,
  createBoundedBrowserControlProbe,
  measureBrowserControl,
} from './loadGeneratorSampler';

describe('load generator sampler', () => {
  it('calculates whole-host CPU from cumulative runner snapshots', () => {
    expect(
      calculateHostCpuPercent({ idle: 4_000, total: 10_000 }, { idle: 4_500, total: 12_000 })
    ).toBe(75);
  });

  it('records runner resources, browser control, and preparation headroom', () => {
    const observation = buildGeneratorShardObservation({
      shardIndex: 2,
      logicalCpuCount: 2,
      samplingDurationMs: 4_000,
      hostCpuPercents: [40, 91, 70, 80],
      hostMemoryPercents: [50, 64, 61],
      hostLoad1m: [1.5, 3.25, 2.75],
      eventLoopDelayP95Ms: 24,
      eventLoopDelayMaxMs: 85,
      browserControlDurationsMs: [15, 20, 400, 25],
      browserControlAttempts: 5,
      browserControlFailures: 1,
      contextPreparationMs: 42_000,
      startHeadroomMs: 180_000,
    });

    expect(observation).toEqual({
      shardIndex: 2,
      logicalCpuCount: 2,
      samplingDurationMs: 4_000,
      sampleCount: 4,
      hostSampleCoveragePercent: 100,
      hostCpuP95Percent: 91,
      hostCpuPeakPercent: 91,
      hostMemoryPeakPercent: 64,
      hostLoad1mPeak: 3.25,
      eventLoopDelayP95Ms: 24,
      eventLoopDelayMaxMs: 85,
      browserControlP95Ms: 400,
      browserControlMaxMs: 400,
      browserControlAttempts: 5,
      browserControlSamples: 4,
      browserControlFailures: 1,
      browserControlAttemptCoveragePercent: 100,
      contextPreparationMs: 42_000,
      startHeadroomMs: 180_000,
    });
  });

  it('bounds a never-resolving Chromium control probe', async () => {
    const startedAt = performance.now();
    const result = await measureBrowserControl(() => new Promise(() => undefined), 5);

    expect(result.durationMs).toBeUndefined();
    expect(performance.now() - startedAt).toBeLessThan(100);
  });

  it('retires a timed-out probe instead of accumulating stuck Chromium requests', async () => {
    let calls = 0;
    const probe = createBoundedBrowserControlProbe(() => {
      calls += 1;
      return new Promise(() => undefined);
    }, 5);

    expect(await probe.sample()).toEqual({ attempted: true, durationMs: undefined });
    expect(await probe.sample()).toEqual({ attempted: false, durationMs: undefined });
    expect(calls).toBe(1);
  });

  it('identifies incomplete sampling and sustained runner pressure', () => {
    const observation = buildGeneratorShardObservation({
      shardIndex: 1,
      logicalCpuCount: 2,
      samplingDurationMs: 10_000,
      hostCpuPercents: [95],
      hostMemoryPercents: [70],
      hostLoad1m: [4],
      eventLoopDelayP95Ms: 150,
      eventLoopDelayMaxMs: 300,
      browserControlDurationsMs: [1_200],
      browserControlAttempts: 2,
      browserControlFailures: 1,
      contextPreparationMs: 45_000,
      startHeadroomMs: 120_000,
    });

    expect(assessGeneratorShard(observation)).toMatchObject({
      complete: false,
      saturated: true,
    });
  });
});
