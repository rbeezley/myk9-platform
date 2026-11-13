/**
 * Per-show fallback poll for the live-sync hook (MYK9-1923).
 *
 * The app-level poll in ReplicationSyncProvider has no show scope, so it never
 * downloads a show's entries or classes: only a broadcast nudge or a one-time
 * scoped pass on open does. Without this poll, a missed or never-subscribed
 * channel left every mounted show surface stale for good.
 */

/** Channel not SUBSCRIBED: the broadcast cannot be trusted, poll briskly. */
export const SHOW_FALLBACK_POLL_DOWN_MS = 20_000;
/** Channel SUBSCRIBED: a safety net for a dropped broadcast, not the main path. */
export const SHOW_FALLBACK_POLL_SUBSCRIBED_MS = 90_000;

export function showFallbackPollDelayMs(subscribed: boolean): number {
  return subscribed ? SHOW_FALLBACK_POLL_SUBSCRIBED_MS : SHOW_FALLBACK_POLL_DOWN_MS;
}
