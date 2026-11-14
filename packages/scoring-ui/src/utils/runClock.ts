/**
 * The clock a run timer measures with (MYK9-2007).
 *
 * `Date.now()` follows the phone's wall clock, which a network time sync can move
 * forward (inflating a run, even timing the dog out) or back (a negative time the
 * field refuses) in the middle of a run. `performance.now()` is monotonic, so a
 * correction never reaches it. Within a page's life it is the measure.
 *
 * The one thing a monotonic clock can get wrong is a sleeping phone: on some
 * devices it stops while the device is suspended, and a judge who locks the
 * screen mid-run still expects the run to have kept counting (it always has).
 * So when the page went hidden during an interval, or the clock was not read for
 * a long stretch, the wall clock is trusted for that interval, never as less than
 * the monotonic one. A wall clock that is corrected while the page stays in view
 * is exactly what this ignores.
 */

/** A silent stretch this long between two reads means the page was suspended or throttled. */
const SUSPENDED_GAP_MS = 1000;

/**
 * Times the page came back (visible again, restored from the back-forward cache,
 * resumed from a freeze). Counted on RETURN, not on hiding: anything that reads the
 * clock while the page is going hidden must not use up the sign that it was away.
 */
let returnCount = 0;
let listening = false;

function listenForSuspension(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  const mark = () => {
    returnCount += 1;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') mark();
  });
  document.addEventListener('resume', mark);
  window.addEventListener('pageshow', mark);
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export interface RunSpan {
  /** Milliseconds since the span started. Never negative, never moved back by a clock change. */
  read: () => number;
}

/** Start measuring a stretch of running time. */
export function startRunSpan(): RunSpan {
  listenForSuspension();
  let elapsed = 0;
  let lastMonotonic = monotonicNow();
  let lastWall = Date.now();
  let lastReturnCount = returnCount;

  return {
    read: () => {
      const monotonic = monotonicNow();
      const wall = Date.now();
      const monotonicStep = Math.max(0, monotonic - lastMonotonic);
      const wallStep = wall - lastWall;
      const straddledSuspension =
        returnCount !== lastReturnCount || monotonicStep >= SUSPENDED_GAP_MS;
      elapsed += straddledSuspension ? Math.max(monotonicStep, wallStep) : monotonicStep;
      lastMonotonic = monotonic;
      lastWall = wall;
      lastReturnCount = returnCount;
      return elapsed;
    },
  };
}
