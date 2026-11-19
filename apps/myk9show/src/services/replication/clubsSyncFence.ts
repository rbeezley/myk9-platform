/**
 * The clubs replica's account fence (MYK9-2168).
 *
 * Every pull of the clubs replica joins the fence. When the signed-in account
 * changes, the identity boundary advances the fence: every pull still running
 * is aborted, and the boundary waits for them to settle before it clears the
 * replica, so a pull started under one account can never write rows after the
 * next account's clear. A pull also asks the fence, after it finishes, whether
 * the account changed while it ran; if so its result is discarded.
 */

interface ActivePull {
  controller: AbortController;
  settled: Promise<void>;
  release: () => void;
}

let epoch = 0;
let pullsBlocked = false;
const active = new Set<ActivePull>();

/**
 * While another account's unsent club change is on this device, no pull may
 * write into the replica: it would mix this account's rows into the rows that
 * account's edit belongs to.
 */
export function setClubsPullsBlocked(blocked: boolean): void {
  pullsBlocked = blocked;
}

export function clubsPullsBlocked(): boolean {
  return pullsBlocked;
}

/** How long the boundary waits for aborted pulls to settle before it gives up. */
export const CLUBS_FENCE_DRAIN_TIMEOUT_MS = 15_000;

export interface ClubsFenceToken {
  /** Aborts when the account changes, or when the caller's own signal aborts. */
  signal: AbortSignal;
  /** True while no account change has happened since this pull joined. */
  isCurrent: () => boolean;
  /** Call in a `finally`: the pull has stopped writing. */
  release: () => void;
}

export function currentClubsFenceEpoch(): number {
  return epoch;
}

/** Join the fence for one pull. `external` is the caller's own cancellation, if any. */
export function joinClubsFence(external?: AbortSignal): ClubsFenceToken {
  const joinedAt = epoch;
  const controller = new AbortController();
  let release!: () => void;
  const settled = new Promise<void>(resolve => {
    release = resolve;
  });
  const pull: ActivePull = { controller, settled, release };
  active.add(pull);

  const onExternalAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener('abort', onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    isCurrent: () => epoch === joinedAt && !controller.signal.aborted,
    release: () => {
      external?.removeEventListener('abort', onExternalAbort);
      active.delete(pull);
      release();
    },
  };
}

/** The account changed: stop every pull that is running. */
export function advanceClubsFence(): void {
  epoch++;
  for (const pull of active) pull.controller.abort();
}

/** Wait for every pull still running to stop. False when one did not stop in time. */
export async function drainClubsFence(timeoutMs = CLUBS_FENCE_DRAIN_TIMEOUT_MS): Promise<boolean> {
  const pending = [...active].map(pull => pull.settled);
  if (pending.length === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([Promise.all(pending).then(() => true as const), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: forget every pull and start a new epoch. */
export function resetClubsFenceForTests(): void {
  for (const pull of active) pull.release();
  active.clear();
  epoch = 0;
  pullsBlocked = false;
}
