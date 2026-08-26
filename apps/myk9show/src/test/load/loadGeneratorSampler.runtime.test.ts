// @vitest-environment node
import type { Browser } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessGeneratorShard, startLoadGeneratorSampler } from './loadGeneratorSampler';

const host = vi.hoisted(() => ({ busy: false, total: 0, idle: 0 }));
vi.mock('node:os', () => ({
  cpus: () => {
    host.total += 100;
    if (!host.busy) host.idle += 100;
    return [{ times: { idle: host.idle, user: host.total - host.idle } }];
  },
  freemem: () => 80,
  totalmem: () => 100,
  loadavg: () => [0, 0, 0],
}));

afterEach(() => vi.useRealTimers());

function probeBrowser() {
  const page = {
    evaluate: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    page,
    context,
    browser: { newContext: vi.fn().mockResolvedValue(context) } as unknown as Browser,
  };
}

describe('generator active-window sampling', () => {
  it('does not dilute active CPU pressure with a long preparation barrier', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    host.busy = false;
    host.total = 0;
    host.idle = 0;
    const page = {
      evaluate: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = { newContext: vi.fn().mockResolvedValue(context) } as unknown as Browser;
    const sampler = await startLoadGeneratorSampler({
      browser,
      shardIndex: 0,
      expectedStartAtMs: 1_500_000,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    sampler.markContextsPrepared();
    await vi.advanceTimersByTimeAsync(1_490_000);
    expect(page.evaluate).not.toHaveBeenCalled();
    sampler.markLoadStarted();
    host.busy = true;
    await vi.advanceTimersByTimeAsync(5_000);
    const observation = await sampler.stop();

    expect(observation.hostCpuP95Percent).toBe(100);
    expect(observation.samplingDurationMs).toBe(5_000);
    expect(observation.samplingWindow).toBe('active-load');
    expect(observation.contextPreparationMs).toBe(10_000);
    expect(observation.startHeadroomMs).toBe(1_490_000);
    expect(assessGeneratorShard(observation).saturated).toBe(true);
  });

  it('fails closed on an active interval too short to sample instead of manufacturing coverage', async () => {
    vi.useFakeTimers();
    const { browser, page } = probeBrowser();
    const sampler = await startLoadGeneratorSampler({ browser, shardIndex: 0 });
    sampler.markContextsPrepared();
    sampler.markLoadStarted();
    await vi.advanceTimersByTimeAsync(500);
    const observation = await sampler.stop();
    expect(observation.sampleCount).toBe(0);
    expect(observation.browserControlAttempts).toBe(0);
    expect(assessGeneratorShard(observation).complete).toBe(false);
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('closes the probe on pre-load failure and enforces milestone ordering', async () => {
    const { browser, page, context } = probeBrowser();
    const sampler = await startLoadGeneratorSampler({ browser, shardIndex: 0 });
    expect(() => sampler.markLoadStarted()).toThrow('Load sampling must start once');
    await expect(sampler.stop()).rejects.toThrow('before active load started');
    expect(page.close).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
