import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { percentile } from './loadMetrics';

const SAMPLE_INTERVAL_MS = 1_000;
const BROWSER_CONTROL_TIMEOUT_MS = 2_000;
const NANOS_PER_MILLISECOND = 1_000_000;
const MIN_SAMPLE_COVERAGE_PERCENT = 80;
const SATURATED_CPU_P95_PERCENT = 90;
const SATURATED_MEMORY_PEAK_PERCENT = 95;
const SATURATED_EVENT_LOOP_P95_MS = 100;
const SATURATED_BROWSER_CONTROL_P95_MS = 1_000;
const SATURATED_BROWSER_CONTROL_FAILURE_RATE = 0.05;

export interface HostCpuSnapshot {
  idle: number;
  total: number;
}

export interface GeneratorShardObservation {
  shardIndex: number;
  /** Absent in legacy reports that included preparation idle time. */
  samplingWindow?: 'active-load';
  logicalCpuCount: number;
  samplingDurationMs: number;
  sampleCount: number;
  hostSampleCoveragePercent: number;
  hostCpuP95Percent: number;
  hostCpuPeakPercent: number;
  hostMemoryPeakPercent: number;
  hostLoad1mPeak: number;
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  browserControlP95Ms: number;
  browserControlMaxMs: number;
  browserControlAttempts: number;
  browserControlSamples: number;
  browserControlFailures: number;
  browserControlAttemptCoveragePercent: number;
  contextPreparationMs: number;
  startHeadroomMs: number;
}

export interface LoadGeneratorSampler {
  markContextsPrepared(preparedAtMs?: number): void;
  markLoadStarted(): void;
  stop(): Promise<GeneratorShardObservation>;
}

export interface GeneratorShardAssessment {
  complete: boolean;
  saturated: boolean;
  reasons: readonly string[];
}

export interface BoundedBrowserControlProbe {
  sample(): Promise<{ attempted: boolean; durationMs: number | undefined }>;
}

export async function startLoadGeneratorSampler(input: {
  browser: Browser;
  shardIndex: number;
  expectedStartAtMs?: number;
  now?: () => number;
}): Promise<LoadGeneratorSampler> {
  const now = input.now ?? Date.now;
  const preparationStartedAtMs = now();
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  const probeContext = await input.browser.newContext();
  const probePage = await probeContext.newPage();
  const hostCpuPercents: number[] = [];
  const hostMemoryPercents: number[] = [];
  const hostLoad1m: number[] = [];
  const browserControlDurationsMs: number[] = [];
  let browserControlFailures = 0;
  const browserControlProbe = createBoundedBrowserControlProbe(
    () => probePage.evaluate(() => true),
    BROWSER_CONTROL_TIMEOUT_MS
  );
  let previousCpu = readHostCpuSnapshot();
  let contextPreparationMs: number | undefined;
  let startHeadroomMs: number | undefined;
  let sampleInFlight: Promise<void> | undefined;
  let browserControlAttempts = 0;
  let stopped = false;
  let samplingStartedAtMs: number | undefined;
  let hostTimer: ReturnType<typeof setInterval> | undefined;
  let browserTimer: ReturnType<typeof setInterval> | undefined;

  const sampleHost = () => {
    const currentCpu = readHostCpuSnapshot();
    hostCpuPercents.push(calculateHostCpuPercent(previousCpu, currentCpu));
    previousCpu = currentCpu;
    hostMemoryPercents.push(readHostMemoryPercent());
    hostLoad1m.push(loadavg()[0] ?? 0);
  };

  const sampleBrowser = async () => {
    const control = await browserControlProbe.sample();
    if (!control.attempted) return;
    browserControlAttempts += 1;
    if (control.durationMs === undefined) {
      browserControlFailures += 1;
    } else {
      browserControlDurationsMs.push(control.durationMs);
    }
  };

  return {
    markContextsPrepared(preparedAtMs = now()) {
      if (contextPreparationMs !== undefined) {
        throw new Error('Load contexts were marked prepared more than once.');
      }
      contextPreparationMs = preparedAtMs - preparationStartedAtMs;
      startHeadroomMs =
        input.expectedStartAtMs === undefined ? 0 : input.expectedStartAtMs - preparedAtMs;
    },
    markLoadStarted() {
      if (stopped || samplingStartedAtMs !== undefined || contextPreparationMs === undefined) {
        throw new Error('Load sampling must start once, after preparation and before stop.');
      }
      samplingStartedAtMs = now();
      // Reset the CPU baseline and event-loop histogram at the barrier. Neither
      // the idle preparation window nor its browser probes may dilute load p95.
      previousCpu = readHostCpuSnapshot();
      histogram.reset();
      histogram.enable();
      hostTimer = setInterval(sampleHost, SAMPLE_INTERVAL_MS);
      browserTimer = setInterval(() => {
        if (sampleInFlight) return;
        sampleInFlight = sampleBrowser().finally(() => {
          sampleInFlight = undefined;
        });
      }, SAMPLE_INTERVAL_MS);
    },
    async stop() {
      if (stopped) {
        throw new Error('Load generator sampler was stopped more than once.');
      }
      stopped = true;
      clearInterval(hostTimer);
      clearInterval(browserTimer);
      const stoppedAtMs = now();
      histogram.disable();
      await sampleInFlight;
      await closeProbe(probePage, probeContext);
      if (
        contextPreparationMs === undefined ||
        startHeadroomMs === undefined ||
        samplingStartedAtMs === undefined
      ) {
        throw new Error('Load generator sampler stopped before active load started.');
      }
      return buildGeneratorShardObservation({
        shardIndex: input.shardIndex,
        samplingWindow: 'active-load',
        logicalCpuCount: cpus().length,
        samplingDurationMs: stoppedAtMs - samplingStartedAtMs,
        hostCpuPercents,
        hostMemoryPercents,
        hostLoad1m,
        eventLoopDelayP95Ms: histogram.percentile(95) / NANOS_PER_MILLISECOND,
        eventLoopDelayMaxMs: histogram.max / NANOS_PER_MILLISECOND,
        browserControlDurationsMs,
        browserControlAttempts,
        browserControlFailures,
        contextPreparationMs,
        startHeadroomMs,
      });
    },
  };
}

export function buildGeneratorShardObservation(input: {
  shardIndex: number;
  samplingWindow?: 'active-load';
  logicalCpuCount: number;
  samplingDurationMs: number;
  hostCpuPercents: readonly number[];
  hostMemoryPercents: readonly number[];
  hostLoad1m: readonly number[];
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  browserControlDurationsMs: readonly number[];
  browserControlAttempts: number;
  browserControlFailures: number;
  contextPreparationMs: number;
  startHeadroomMs: number;
}): GeneratorShardObservation {
  return {
    shardIndex: input.shardIndex,
    ...(input.samplingWindow && { samplingWindow: input.samplingWindow }),
    logicalCpuCount: input.logicalCpuCount,
    samplingDurationMs: roundMetric(input.samplingDurationMs),
    sampleCount: input.hostCpuPercents.length,
    hostSampleCoveragePercent: calculateSampleCoveragePercent(
      input.samplingDurationMs,
      input.hostCpuPercents.length
    ),
    hostCpuP95Percent: roundMetric(percentile(input.hostCpuPercents, 95)),
    hostCpuPeakPercent: roundMetric(maximum(input.hostCpuPercents)),
    hostMemoryPeakPercent: roundMetric(maximum(input.hostMemoryPercents)),
    hostLoad1mPeak: roundMetric(maximum(input.hostLoad1m)),
    eventLoopDelayP95Ms: roundMetric(input.eventLoopDelayP95Ms),
    eventLoopDelayMaxMs: roundMetric(input.eventLoopDelayMaxMs),
    browserControlP95Ms: roundMetric(percentile(input.browserControlDurationsMs, 95)),
    browserControlMaxMs: roundMetric(maximum(input.browserControlDurationsMs)),
    browserControlAttempts: input.browserControlAttempts,
    browserControlSamples: input.browserControlDurationsMs.length,
    browserControlFailures: input.browserControlFailures,
    browserControlAttemptCoveragePercent: calculateSampleCoveragePercent(
      input.samplingDurationMs,
      input.browserControlAttempts
    ),
    contextPreparationMs: roundMetric(input.contextPreparationMs),
    startHeadroomMs: roundMetric(input.startHeadroomMs),
  };
}

export function assessGeneratorShard(shard: GeneratorShardObservation): GeneratorShardAssessment {
  const reasons: string[] = [];
  const hostCoverage = calculateSampleCoveragePercent(shard.samplingDurationMs, shard.sampleCount);
  const browserCoverage = calculateSampleCoveragePercent(
    shard.samplingDurationMs,
    shard.browserControlAttempts
  );
  const coverageReconciles =
    hostCoverage === shard.hostSampleCoveragePercent &&
    browserCoverage === shard.browserControlAttemptCoveragePercent;
  const complete =
    shard.samplingWindow === 'active-load' &&
    shard.samplingDurationMs > 0 &&
    shard.sampleCount > 0 &&
    shard.browserControlAttempts > 0 &&
    shard.browserControlSamples + shard.browserControlFailures === shard.browserControlAttempts &&
    coverageReconciles &&
    hostCoverage >= MIN_SAMPLE_COVERAGE_PERCENT &&
    browserCoverage >= MIN_SAMPLE_COVERAGE_PERCENT;
  if (shard.samplingWindow !== 'active-load') {
    reasons.push('active-load sampling window missing');
  }
  if (hostCoverage < MIN_SAMPLE_COVERAGE_PERCENT) {
    reasons.push(`host sampling coverage ${hostCoverage}%`);
  }
  if (browserCoverage < MIN_SAMPLE_COVERAGE_PERCENT) {
    reasons.push(`browser-control coverage ${browserCoverage}%`);
  }
  if (!coverageReconciles) {
    reasons.push('recorded sampling coverage did not reconcile');
  }
  if (shard.browserControlSamples + shard.browserControlFailures !== shard.browserControlAttempts) {
    reasons.push('browser-control attempts did not reconcile');
  }

  const failureRate =
    shard.browserControlAttempts === 0
      ? 1
      : shard.browserControlFailures / shard.browserControlAttempts;
  if (shard.hostCpuP95Percent >= SATURATED_CPU_P95_PERCENT) {
    reasons.push(`host CPU p95 ${shard.hostCpuP95Percent}%`);
  }
  if (shard.hostMemoryPeakPercent >= SATURATED_MEMORY_PEAK_PERCENT) {
    reasons.push(`host memory peak ${shard.hostMemoryPeakPercent}%`);
  }
  if (shard.eventLoopDelayP95Ms >= SATURATED_EVENT_LOOP_P95_MS) {
    reasons.push(`event-loop p95 ${shard.eventLoopDelayP95Ms} ms`);
  }
  if (shard.browserControlP95Ms >= SATURATED_BROWSER_CONTROL_P95_MS) {
    reasons.push(`browser-control p95 ${shard.browserControlP95Ms} ms`);
  }
  if (failureRate >= SATURATED_BROWSER_CONTROL_FAILURE_RATE) {
    reasons.push(`browser-control failure rate ${roundMetric(failureRate * 100)}%`);
  }
  const saturationReasonCount = reasons.filter(
    reason =>
      !reason.includes('coverage') && !reason.includes('reconcile') && !reason.includes('window')
  ).length;
  return { complete, saturated: saturationReasonCount > 0, reasons };
}

export async function measureBrowserControl(
  probe: () => Promise<unknown>,
  timeoutMs: number,
  now: () => number = performance.now.bind(performance)
): Promise<{ durationMs: number | undefined }> {
  const startedAtMs = now();
  const outcome = await settleWithin(Promise.resolve().then(probe), timeoutMs);
  return {
    durationMs: outcome === 'resolved' ? roundMetric(now() - startedAtMs) : undefined,
  };
}

export function createBoundedBrowserControlProbe(
  probe: () => Promise<unknown>,
  timeoutMs: number
): BoundedBrowserControlProbe {
  let disabled = false;
  return {
    async sample() {
      if (disabled) return { attempted: false, durationMs: undefined };
      const result = await measureBrowserControl(probe, timeoutMs);
      if (result.durationMs === undefined) disabled = true;
      return { attempted: true, durationMs: result.durationMs };
    },
  };
}

export function calculateHostCpuPercent(
  previous: HostCpuSnapshot,
  current: HostCpuSnapshot
): number {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0) return 0;
  return roundMetric(Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100)));
}

function readHostCpuSnapshot(): HostCpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }
  return { idle, total };
}

function readHostMemoryPercent(): number {
  const total = totalmem();
  if (total <= 0) return 0;
  return ((total - freemem()) / total) * 100;
}

function maximum(values: readonly number[]): number {
  return values.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...values);
}

function expectedSampleCount(durationMs: number): number {
  return Math.max(1, Math.floor(Math.max(0, durationMs) / SAMPLE_INTERVAL_MS));
}

export function calculateSampleCoveragePercent(durationMs: number, actual: number): number {
  return roundMetric(Math.min(100, (actual / expectedSampleCount(durationMs)) * 100));
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000) / 1_000 : value;
}

async function closeProbe(page: Page, context: BrowserContext): Promise<void> {
  await settleWithin(page.close(), BROWSER_CONTROL_TIMEOUT_MS);
  await settleWithin(context.close(), BROWSER_CONTROL_TIMEOUT_MS);
}

async function settleWithin(
  promise: Promise<unknown>,
  timeoutMs: number
): Promise<'resolved' | 'rejected' | 'timed-out'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timed-out'>(resolve => {
    timer = setTimeout(() => resolve('timed-out'), timeoutMs);
  });
  const result = await Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const
    ),
    timeout,
  ]);
  if (timer) clearTimeout(timer);
  return result;
}
