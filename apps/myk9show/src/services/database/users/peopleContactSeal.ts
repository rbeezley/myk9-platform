/**
 * MYK9-2255: the sign-out state of the saved people directory. A leaf module
 * (no store import) so `userStore` can read it without a cycle.
 *
 * - `generation` moves on every sign-out; a directory load remembers the one it
 *   started under and drops its result when it has moved.
 * - `sealed` is true from sign-out until the next session appears; a late
 *   rehydration while sealed is stripped on the way in.
 * - the purge marker (memory and localStorage) records that a removal has not
 *   been confirmed, so a failed one runs again on the next load, even after a
 *   reload. Every storage access is best effort.
 */
const MARKER_KEY = 'myk9.peopleContactPurgePending.v1';

function markerSet(): boolean {
  try {
    return window.localStorage.getItem(MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

let generation = 0;
let retryPending = markerSet();
let sealed = retryPending;

export function currentPeopleGeneration(): number {
  return generation;
}

/** True from a sign-out until a session is present again. */
export function isPeopleContactSealed(): boolean {
  return sealed;
}

/** True while a removal has not been confirmed. */
export function isPeopleContactPurgePending(): boolean {
  return retryPending || markerSet();
}

export function beginPeopleContactSeal(): void {
  generation += 1;
  sealed = true;
  retryPending = true;
  try {
    window.localStorage.setItem(MARKER_KEY, '1');
  } catch {
    // Memory flag still covers this page's lifetime.
  }
}

/** The removal is confirmed everywhere; the marker goes. */
export function completePeopleContactPurge(): void {
  retryPending = false;
  try {
    window.localStorage.removeItem(MARKER_KEY);
  } catch {
    // Nothing to do: the memory flag is already clear.
  }
}

/** A session is present again; loads and rehydration may write contact details. */
export function releasePeopleContactSeal(): void {
  sealed = false;
}
