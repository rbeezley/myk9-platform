/**
 * Spacing for realtime change nudges (MYK9-1304).
 *
 * One broadcast per score would otherwise make every device in the show sync on
 * every score. Per show, scoped passes are at least SHOW_NUDGE_MIN_GAP_MS apart:
 * nudges inside the gap coalesce into ONE trailing fire carrying the union of the
 * changed tables. Per device, a jitter drawn once per module load is added to
 * every scheduled fire so the devices in one show do not stampede together.
 *
 * All timing is on the monotonic clock (`performance.now()`): a wall-clock step
 * or a server timestamp must never stretch or collapse the gap. Nothing here
 * accumulates while a tab is hidden: pending state is one set per show, so a tab
 * hidden for an hour fires once when its timer lands, not a burst.
 */

import type { ShowChangeTable } from './showChangeSignal';

export const SHOW_NUDGE_MIN_GAP_MS = 5_000;
export const SHOW_NUDGE_MAX_JITTER_MS = 3_000;

interface ShowGateState {
  lastFireAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  pending: Set<ShowChangeTable>;
  fire: ((tables: ReadonlySet<ShowChangeTable>) => void) | null;
}

const shows = new Map<string, ShowGateState>();
let random: () => number = Math.random;
let deviceJitterMs: number | null = null;

function jitter(): number {
  deviceJitterMs ??= Math.floor(random() * SHOW_NUDGE_MAX_JITTER_MS);
  return deviceJitterMs;
}

/** Test seam: inject the RNG that draws the device jitter. */
export function setShowNudgeRandom(next: () => number): void {
  random = next;
}

/** Test seam: forget every show's gap and the drawn jitter. */
export function resetShowNudgeGate(): void {
  for (const state of shows.values()) if (state.timer) clearTimeout(state.timer);
  shows.clear();
  deviceJitterMs = null;
  random = Math.random;
}

/**
 * Ask for a scoped pass for `tables` of `showId`. State is per show and shared
 * by every mount for that show, so there is deliberately no per-caller cancel.
 */
export function scheduleShowNudge(
  showId: string,
  tables: ReadonlySet<ShowChangeTable>,
  fire: (tables: ReadonlySet<ShowChangeTable>) => void
): void {
  let state = shows.get(showId);
  if (!state) {
    state = { lastFireAt: null, timer: null, pending: new Set(), fire: null };
    shows.set(showId, state);
  }
  const gate = state;
  for (const table of tables) gate.pending.add(table);
  gate.fire = fire;

  if (!gate.timer) {
    const sinceLast = gate.lastFireAt === null ? Infinity : performance.now() - gate.lastFireAt;
    // A negative elapsed time (clock anomaly) is treated as "just fired".
    const gapLeft = Math.min(SHOW_NUDGE_MIN_GAP_MS, Math.max(0, SHOW_NUDGE_MIN_GAP_MS - sinceLast));
    gate.timer = setTimeout(() => {
      gate.timer = null;
      const due = gate.pending;
      const run = gate.fire;
      gate.pending = new Set();
      gate.fire = null;
      gate.lastFireAt = performance.now();
      run?.(due);
    }, gapLeft + jitter());
  }
}
