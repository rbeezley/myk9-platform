/**
 * What a scoresheet timer keeps on the device so a reload mid-run does not lose
 * the dog's time (MYK9-2007). After a reload the monotonic clock is gone, so the
 * wall clock is all there is to bridge the gap: it is trusted only when the span
 * is plausible, and otherwise the judge is told plainly the time was lost.
 */

const KEY_PREFIX = 'myk9:run-timer:';

/** How often a running timer writes its position (ms). */
export const PERSIST_INTERVAL_MS = 1000;
/** A reload longer than this mid-run is not trusted: the time is reported lost. */
export const MAX_RELOAD_GAP_MS = 5 * 60 * 1000;
/** A saved timer older than this is another day's run, not this one. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export interface TimerSnapshot {
  /** Elapsed ms at `wallAt`. */
  elapsedMs: number;
  running: boolean;
  /** `Date.now()` when this snapshot was written. */
  wallAt: number;
}

/** What the timer did on mount. `lost` means the time could not be recovered. */
export type TimerRecovery = 'resumed' | 'stopped' | 'lost' | null;

export interface RestoredTimer {
  elapsedMs: number;
  running: boolean;
  recovery: TimerRecovery;
}

function keyFor(persistKey: string, kind: string): string {
  return `${KEY_PREFIX}${persistKey}:${kind}`;
}

export function writeTimerSnapshot(persistKey: string, kind: string, snap: TimerSnapshot): void {
  try {
    localStorage.setItem(keyFor(persistKey, kind), JSON.stringify(snap));
  } catch {
    // Storage full or blocked: the timer still runs, it just cannot survive a reload.
  }
}

export function clearTimerSnapshot(persistKey: string, kind: string): void {
  try {
    localStorage.removeItem(keyFor(persistKey, kind));
  } catch {
    // Nothing to clear.
  }
}

/** Every timer kept for this entry: its score is saved, so no run is left to restore. */
export function clearRunTimers(persistKey: string): void {
  clearTimerSnapshot(persistKey, 'search');
  clearTimerSnapshot(persistKey, 'element');
}

function readSnapshot(persistKey: string, kind: string): TimerSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(persistKey, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TimerSnapshot>;
    if (
      typeof parsed.elapsedMs !== 'number' ||
      typeof parsed.wallAt !== 'number' ||
      typeof parsed.running !== 'boolean' ||
      !Number.isFinite(parsed.elapsedMs) ||
      parsed.elapsedMs < 0
    ) {
      return null;
    }
    return { elapsedMs: parsed.elapsedMs, running: parsed.running, wallAt: parsed.wallAt };
  } catch {
    return null;
  }
}

/** The timer this scoresheet was running before the page reloaded, or null for a fresh start. */
export function restoreTimer(
  persistKey: string | undefined,
  kind: string,
  hasSavedScore = false,
  wallNow: number = Date.now()
): RestoredTimer | null {
  if (!persistKey) return null;
  // An entry that already has a saved score owns a finished run: whatever timer is
  // left on the device is from before that save (an app killed right after Save).
  if (hasSavedScore) {
    clearTimerSnapshot(persistKey, kind);
    return null;
  }
  const snap = readSnapshot(persistKey, kind);
  if (!snap) return null;
  const gap = wallNow - snap.wallAt;
  if (Math.abs(gap) > STALE_AFTER_MS) return null;
  // A stopped timer owes nothing to the wall clock.
  if (!snap.running) {
    return snap.elapsedMs > 0
      ? { elapsedMs: snap.elapsedMs, running: false, recovery: 'stopped' }
      : null;
  }
  // Running: the gap since the last write is the time the reload took. A clock
  // that went backward, or a gap too long to be a reload, is not trusted.
  if (gap < 0 || gap > MAX_RELOAD_GAP_MS) {
    return { elapsedMs: 0, running: false, recovery: 'lost' };
  }
  return { elapsedMs: snap.elapsedMs + gap, running: true, recovery: 'resumed' };
}

/** One plain sentence for the judge, or null when nothing was recovered. */
export function recoveryNotice(recovery: TimerRecovery): string | null {
  switch (recovery) {
    case 'resumed':
      return 'The app restarted mid-run. The timer kept its time and is still running.';
    case 'stopped':
      return 'The app restarted. The timer is back at its stopped time. Check the time below.';
    case 'lost':
      return 'The app restarted and this run’s time was lost. Type the time, use max time, or run the dog again.';
    default:
      return null;
  }
}
