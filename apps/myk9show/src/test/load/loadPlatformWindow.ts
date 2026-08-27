// The sampler takes its baseline before load starts so the first statement
// snapshot excludes rehearsal traffic, and keeps sampling past the scenario so
// the closing snapshot covers work still draining.
export const PLATFORM_BASELINE_LEAD_MS = 15_000;
export const PLATFORM_DRAIN_GRACE_MS = 30_000;

export interface PlatformSamplingWindow {
  /** Wait this long before taking the baseline snapshot. */
  baselineDelayMs: number;
  /** Stop sampling at this absolute epoch millisecond. */
  stopAtMs: number;
}

export function platformSamplingWindow(input: {
  startAtMs: number;
  durationMs: number;
  nowMs: number;
}): PlatformSamplingWindow {
  const { startAtMs, durationMs, nowMs } = input;
  if (!Number.isSafeInteger(startAtMs) || startAtMs <= 0) {
    throw new Error('Platform sampling requires a valid synchronized start.');
  }
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error('Platform sampling requires a positive scenario duration.');
  }

  const baselineAtMs = startAtMs - PLATFORM_BASELINE_LEAD_MS;
  const stopAtMs = startAtMs + durationMs + PLATFORM_DRAIN_GRACE_MS;
  // Fail closed rather than emit a window that never covered the load, which
  // would read downstream as complete telemetry.
  if (nowMs >= stopAtMs) {
    throw new Error('Platform sampling missed the synchronized load window entirely.');
  }
  if (nowMs > baselineAtMs + PLATFORM_BASELINE_LEAD_MS) {
    throw new Error('Platform sampling cannot take a baseline after load has started.');
  }

  return { baselineDelayMs: Math.max(0, baselineAtMs - nowMs), stopAtMs };
}
