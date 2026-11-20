/** Watermark rules of one table sync, split out of syncReplicatedTable.ts. */

/**
 * The `since` the fetch starts from. Finite-guards the persisted watermark: a
 * corrupt IDB value (NaN/Infinity) would otherwise reach
 * `new Date(since).toISOString()` in the adapter and throw a RangeError,
 * wedging that table's sync. NaN is already falsy (to 0); this also catches
 * Infinity. A bad watermark degrades to a full-ish fetch, never a thrown sync.
 */
export function computeSince(
  persistedWatermark: number | undefined,
  forceFullSync: boolean,
  bufferMs: number
): number {
  const safeWatermark = Number.isFinite(persistedWatermark) ? (persistedWatermark as number) : 0;
  const rawSince = forceFullSync ? 0 : safeWatermark;
  return rawSince > bufferMs ? rawSince - bufferMs : 0;
}

/**
 * Server-authoritative, monotonic watermark, routed to the correct scope slot.
 * Advance only to a timestamp the client actually observed from the server, and
 * never backward (monotonic inside the cache transaction so a concurrent slow
 * sync can't regress a faster one). Fall back to the legacy client clock ONLY
 * when the adapter provides no timestamp hook. With a hook but nothing observed
 * (empty fetch), leave the watermark untouched.
 */
/** The newest server `updated_at` a fetch returned. */
export class WatermarkTracker {
  max = 0;
  saw = false;

  observe(ts: number | null | undefined): void {
    // NaN/null guard: a row with no usable server timestamp is still cached as
    // data, but must never enter the watermark max: Math.max(NaN, ...) is NaN,
    // and new Date(NaN).toISOString() throws on the next fetch, breaking every
    // subsequent sync.
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return;
    if (ts > this.max) this.max = ts;
    this.saw = true;
  }
}

export function planWatermark(
  hasTimestampHook: boolean,
  tracker: WatermarkTracker
): { advanceWatermark: boolean; watermarkUpdate: Partial<{ lastIncrementalSyncAt: number }> } {
  const advanceWatermark = hasTimestampHook && tracker.saw;
  const watermarkUpdate = advanceWatermark
    ? { lastIncrementalSyncAt: tracker.max }
    : hasTimestampHook
      ? {}
      : { lastIncrementalSyncAt: Date.now() };
  return { advanceWatermark, watermarkUpdate };
}
