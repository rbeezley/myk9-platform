/**
 * Lightweight perf instrumentation helpers.
 *
 * Emits `performance.mark` / `performance.measure` entries (no-op in
 * environments without the Performance API) and a `replication:perf-measure`
 * CustomEvent apps can listen for to log, aggregate, or display metrics.
 *
 * Marks and measures are cheap (<1μs each) — safe to leave on in production.
 * Apps opt into logging by subscribing to the event.
 */

const hasPerf = typeof performance !== 'undefined' && typeof performance.mark === 'function';
const hasWindow = typeof window !== 'undefined';

/** Start a perf span. */
export function markPerf(name: string): void {
  if (!hasPerf) return;
  try {
    performance.mark(name);
  } catch {
    // Ignore — some environments throw on duplicate mark names
  }
}

/** End a perf span started by `markPerf(startName)` and emit a measure + event. */
export function measurePerf(
  name: string,
  startName: string,
  detail?: Record<string, unknown>
): void {
  let durationMs: number | undefined;

  if (hasPerf) {
    try {
      const entry = performance.measure(name, startName);
      durationMs = entry?.duration;
    } catch {
      // Start mark may be missing; fall through
    }
  }

  if (hasWindow) {
    window.dispatchEvent(
      new CustomEvent('replication:perf-measure', {
        detail: {
          name,
          durationMs: durationMs ?? (detail?.durationMs as number | undefined),
          ...detail,
        },
      })
    );
  }
}
