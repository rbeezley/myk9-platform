/**
 * Per-show fallback poll for the live-sync hook (MYK9-1923).
 *
 * The app-level poll in ReplicationSyncProvider has no show scope, so it never
 * downloads a show's entries or classes: only a broadcast nudge or a one-time
 * scoped pass on open does. Without this poll, a missed or never-subscribed
 * channel left every mounted show surface stale for good.
 *
 * It keeps the show-day load plan's cadence (MYK9-1305, `syncCadence.ts`): the
 * same 60 s as the provider's poll while the channel is down, and 3-5 minutes
 * with jitter while it is SUBSCRIBED, when broadcasts carry freshness and this
 * is only a backstop. Every device with a show open runs it, so a faster
 * subscribed interval would multiply database load on show day.
 */
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { SLOW_POLL_MAX_MS, SLOW_POLL_MIN_MS } from '@/providers/syncCadence';

/** Channel not SUBSCRIBED: the provider's own 60 s offline-first fallback. */
export const SHOW_FALLBACK_POLL_DOWN_MS = SYNC_INTERVAL_MS;
/** Channel SUBSCRIBED: the longest backstop delay (3-5 min window, MYK9-1305). */
export const SHOW_FALLBACK_POLL_SUBSCRIBED_MS = SLOW_POLL_MAX_MS;

export function showFallbackPollDelayMs(subscribed: boolean, random: () => number = Math.random) {
  if (!subscribed) return SHOW_FALLBACK_POLL_DOWN_MS;
  return SLOW_POLL_MIN_MS + Math.floor(random() * (SLOW_POLL_MAX_MS - SLOW_POLL_MIN_MS));
}
