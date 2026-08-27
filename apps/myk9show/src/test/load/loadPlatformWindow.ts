// The sampler takes its baseline before load starts so the first statement
// snapshot excludes rehearsal traffic, and keeps sampling past the scenario so
// the closing snapshot covers work still draining.
export const PLATFORM_BASELINE_LEAD_MS = 15_000;
// Must cover loadReplicationProbe's QUEUE_DRAIN_TIMEOUT_MS (SYNC_INTERVAL_MS +
// 30s = 90s), which is how long each session may still be flushing after the
// scenario ends. Stopping earlier drops those flushes from the closing snapshot
// and under-reports peakConnections -- and since the gate only fails when
// connections EXCEED the cap, a truncated window can turn a real breach into a
// pass. Pinned against that constant in the tests so the two cannot drift.
export const PLATFORM_DRAIN_GRACE_MS = 90_000;

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

/**
 * A baseline snapshot taken after load starts already contains rehearsal traffic,
 * so every statement delta computed against it undercounts the run — while the
 * artifact still pairs with the rehearsal and reads as complete telemetry.
 */
export function assertBaselineBeforeStart(input: {
  startAtMs: number;
  baselineCompletedAtMs: number;
}): void {
  if (input.baselineCompletedAtMs >= input.startAtMs) {
    throw new Error(
      'Platform baseline completed after load started; telemetry would undercount the rehearsal.'
    );
  }
}
