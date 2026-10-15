/**
 * Share one in-flight async read between concurrent callers that ask for the same key.
 *
 * MYK9-1170: class replication syncs once per TRIAL, and every trial's enrichment asked the
 * same per-SHOW RPC (`get_show_judges`, `get_show_class_hide_counts`), so a seven-trial show
 * paid for seven identical round trips on every page load. Callers that overlap now await one
 * promise. The entry is dropped the moment it settles, so nothing is ever served stale: a
 * sequential second call (a later sync, a broadcast-triggered refresh) always reads fresh.
 *
 * A read that never settles (a wedged connection) stops being joinable after `maxJoinAgeMs`,
 * so one hung request cannot park every later sync of that show behind it.
 */
export const IN_FLIGHT_MAX_JOIN_AGE_MS = 15_000;

/** Runs `read`, sharing it with any overlapping call that passed the same `key`. */
export type ShareRead = <T>(key: string, read: () => Promise<T>) => Promise<T>;

/** The unshared default: every call reads for itself. */
export const readNow: ShareRead = (_key, read) => read();

export function createInFlightSharer(maxJoinAgeMs = IN_FLIGHT_MAX_JOIN_AGE_MS): ShareRead {
  const inFlight = new Map<string, { startedAt: number; read: Promise<unknown> }>();
  return <T>(key: string, read: () => Promise<T>): Promise<T> => {
    const running = inFlight.get(key);
    if (running && Date.now() - running.startedAt < maxJoinAgeMs) {
      return running.read as Promise<T>;
    }
    const entry = {
      startedAt: Date.now(),
      read: read().finally(() => {
        if (inFlight.get(key) === entry) inFlight.delete(key);
      }) as Promise<unknown>,
    };
    inFlight.set(key, entry);
    return entry.read as Promise<T>;
  };
}
