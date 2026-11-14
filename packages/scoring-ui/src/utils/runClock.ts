/**
 * The clock every scoresheet timer measures with (MYK9-2007).
 *
 * `Date.now()` follows the phone's wall clock, which corrects itself forward or
 * back mid-run (network time, a timezone change). A forward jump inflates the
 * time and can time the dog out; a backward jump gives a negative time. So a run
 * is measured with `performance.now()`, which never jumps within a page life.
 *
 * `performance.now()` can also stand still while the phone sleeps or the tab is
 * frozen, which would lose real time on a locked phone. So while the page is
 * hidden the wall clock is consulted once, on return: whatever the wall clock
 * advanced beyond the monotonic clock is credited (the time the page slept
 * through), clamped to a plausible sleep. A wall correction that happens while the
 * scoresheet is on screen is never credited.
 */

/** The longest hidden span credited from the wall clock (a dog is never timed for hours). */
export const MAX_HIDDEN_CREDIT_MS = 30 * 60 * 1000;

let creditMs = 0;
let hiddenAt: { mono: number; wall: number } | null = null;
let listening = false;

function mono(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    hiddenAt = { mono: mono(), wall: Date.now() };
    return;
  }
  if (!hiddenAt) return;
  const wallGap = Date.now() - hiddenAt.wall;
  const monoGap = mono() - hiddenAt.mono;
  hiddenAt = null;
  // Only what the monotonic clock missed; a backward or equal wall gap credits nothing.
  creditMs += Math.min(Math.max(0, wallGap - monoGap), MAX_HIDDEN_CREDIT_MS);
}

function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/** Milliseconds on a clock that ignores wall-clock corrections. Only differences mean anything. */
export function runClockNow(): number {
  listen();
  return mono() + creditMs;
}

/** Test seam: forget credit and hidden state between cases. */
export function resetRunClockForTests(): void {
  creditMs = 0;
  hiddenAt = null;
}
