/**
 * Spaces out the UNTARGETED full sync passes ReplicationSyncProvider runs on its
 * own initiative (60s poll, tab becoming visible, realtime re-SUBSCRIBED), so an
 * idle tab costs almost nothing against the live database (MYK9-1054).
 *
 * Explicit requests (a user action, upload-complete, a realtime change nudge)
 * bypass this and run promptly; they only report their start via
 * {@link SyncPassScheduler.notePassStarted} so the next untargeted pass is spaced
 * from them too.
 */

/** Minimum spacing between untargeted passes. */
export const UNTARGETED_PASS_MIN_GAP_MS = 15_000;

export interface SyncPassSchedulerOptions {
  /** Starts one full sync pass. */
  run: () => void;
  /**
   * Whether an untargeted pass may run now. Checked when a request arrives and
   * again when a delayed pass comes due. False (tab hidden) drops the request;
   * the visibility catch-up request covers it.
   */
  canRun: () => boolean;
  minGapMs?: number;
}

export interface SyncPassScheduler {
  /** Poll / visibility: run now if the gap has elapsed, else once it does. */
  requestUntargeted: () => void;
  /**
   * Realtime re-SUBSCRIBED: events may have been missed while the channel was
   * down, so a pass is owed, but never at once. A reconnect storm on a flapping
   * channel then collapses into one pass per gap instead of one per reconnect.
   * Delayed by the gap (not dropped); the 60s poll remains the backstop.
   */
  requestDeferred: () => void;
  /** Record that a pass started for any reason, so untargeted passes space from it. */
  notePassStarted: () => void;
  dispose: () => void;
}

export function createSyncPassScheduler({
  run,
  canRun,
  minGapMs = UNTARGETED_PASS_MIN_GAP_MS,
}: SyncPassSchedulerOptions): SyncPassScheduler {
  let lastStartedAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delayMs: number) => {
    if (timer) return; // coalesce into the pass already owed
    timer = setTimeout(() => {
      timer = null;
      fire();
    }, delayMs);
  };

  const fire = () => {
    if (!canRun()) return;
    lastStartedAt = Date.now();
    run();
  };

  return {
    requestUntargeted: () => {
      if (!canRun()) return;
      const elapsed = Date.now() - lastStartedAt;
      if (elapsed >= minGapMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        fire();
      } else {
        schedule(minGapMs - elapsed);
      }
    },
    requestDeferred: () => {
      schedule(minGapMs);
    },
    notePassStarted: () => {
      lastStartedAt = Date.now();
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
