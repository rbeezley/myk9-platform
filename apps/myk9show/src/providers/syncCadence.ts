/**
 * Poll cadence for the untargeted sync pass (MYK9-1305).
 *
 * While at least one show channel is SUBSCRIBED and the device is online,
 * realtime nudges carry freshness and the poll is only a correctness backstop,
 * so it stretches to 3-5 minutes with uniform jitter. Offline, or with no
 * subscribed channel, it stays at the 60 s offline-first fallback.
 *
 * Pure module state (no React). The 24 h forced full sync and the `since`
 * buffer live in the replication engine and are untouched. Jitter uses the
 * device only (Math.random), never a server timestamp.
 */

import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { features } from '@/config/features';

export const SLOW_POLL_MIN_MS = 180_000;
export const SLOW_POLL_MAX_MS = 300_000;

type Listener = () => void;

/** Mount tokens whose show channel is SUBSCRIBED. One token per hook mount, so two mounts sharing one channel cannot clear each other. */
const subscribedMounts = new Set<string>();
let mountSeq = 0;
/** Surfaces that need the 60 s poll for tables no show channel broadcasts. */
let fastPollHolds = 0;
const listeners = new Set<Listener>();
let online = true;
let random: () => number = Math.random;

const isSlow = (): boolean =>
  features.replicationSubscribedCadence &&
  online &&
  subscribedMounts.size > 0 &&
  fastPollHolds === 0;

/** Runs a state change and notifies once if it flipped slow <-> fast. */
function mutate(change: () => void): void {
  const before = isSlow();
  change();
  if (isSlow() === before) return;
  for (const listener of [...listeners]) listener();
}

/** An opaque token for one mount's show channel subscription. */
export function registerShowChannelMount(showId: string): string {
  mountSeq += 1;
  return `${showId}#${mountSeq}`;
}

export function markShowChannel(mountToken: string, subscribed: boolean): void {
  mutate(() => {
    if (subscribed) subscribedMounts.add(mountToken);
    else subscribedMounts.delete(mountToken);
  });
}

export function clearShowChannel(mountToken: string): void {
  markShowChannel(mountToken, false);
}

/**
 * Keep the 60 s poll while a surface is open that shows tables the show
 * channels do not broadcast (dogs), even with a channel SUBSCRIBED (MYK9-1523).
 * Returns the release.
 */
export function holdFastPoll(): () => void {
  mutate(() => {
    fastPollHolds += 1;
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mutate(() => {
      fastPollHolds -= 1;
    });
  };
}

export function markOnline(isOnline: boolean): void {
  mutate(() => {
    online = isOnline;
  });
}

/** Delay until the next untargeted poll tick. */
export function nextPollDelayMs(): number {
  if (!isSlow()) return SYNC_INTERVAL_MS;
  return SLOW_POLL_MIN_MS + Math.floor(random() * (SLOW_POLL_MAX_MS - SLOW_POLL_MIN_MS + 1));
}

/** Fires when the cadence flips between slow and the 60 s fallback. Returns unsubscribe. */
export function onCadenceChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: inject the jitter source. */
export function setCadenceRandom(next: () => number): void {
  random = next;
}

/** Test seam: restore the initial module state. */
export function resetSyncCadence(): void {
  subscribedMounts.clear();
  fastPollHolds = 0;
  listeners.clear();
  online = true;
  random = Math.random;
}
