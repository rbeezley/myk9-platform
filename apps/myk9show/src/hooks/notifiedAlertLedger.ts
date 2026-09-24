/**
 * notifiedAlertLedger — which in-app alerts a user has already been shown
 * (MYK9-735).
 *
 * `useNotificationMonitor` alerts on a STATE it reads from a snapshot (a class
 * is finalized, a class is In Progress, a dog is in the ring), not on a
 * transition it witnessed. Its dedupe used to live in refs, which reset on
 * every page load, so each sign-in re-announced "Results posted" for a class
 * finalized weeks earlier. This ledger keeps the dedupe in device storage, per
 * signed-in user, so each alert fires once ever:
 *
 * - an event that happened while the user was away still alerts on their next
 *   load (its key was never recorded);
 * - it never repeats after that;
 * - another account on the same browser has its own record.
 *
 * Records older than 30 days are pruned, and every storage access is wrapped:
 * when storage is missing, blocked or full, the ledger still dedupes in memory
 * for the life of the page, which is the old behaviour.
 */

const STORAGE_PREFIX = 'myk9-notified-alerts:v1';
export const NOTIFIED_ALERT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Hard cap so a pathological session cannot grow the record without bound. */
const MAX_RECORDS = 2000;

type Records = Record<string, number>;

export interface NotifiedAlertLedger {
  /** True when this alert key has already been delivered to this user. */
  has(key: string): boolean;
  /** Record the alert key as delivered. */
  mark(key: string): void;
}

export function notifiedAlertStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

/** Alert keys, one per distinct thing a user can be told about. */
export const alertKey = {
  resultsPosted: (classId: string) => `results_posted:${classId}`,
  classStarting: (classId: string) => `class_starting:${classId}`,
  checkInReminder: (classId: string, entryId: string) => `check_in_reminder:${classId}:${entryId}`,
  yourTurn: (classId: string, inRingEntryId: string, entryId: string) =>
    `your_turn:${classId}:${inRingEntryId}:${entryId}`,
};

function readRecords(storageKey: string): Records {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Records = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function prune(records: Records, now: number): Records {
  const kept = Object.entries(records)
    .filter(([, at]) => now - at < NOTIFIED_ALERT_TTL_MS)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_RECORDS);
  return Object.fromEntries(kept);
}

function writeRecords(storageKey: string, records: Records): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    // Storage blocked or full: the in-memory set still dedupes this page.
  }
}

/**
 * A ledger for `userId`. With no user id (signed out, or identity not yet
 * resolved) nothing is persisted, so nothing can leak to the next account.
 */
export function createNotifiedAlertLedger(
  userId: string | null | undefined,
  now: () => number = Date.now
): NotifiedAlertLedger {
  const memory = new Set<string>();
  const storageKey = userId ? notifiedAlertStorageKey(userId) : null;

  if (storageKey) {
    const stored = readRecords(storageKey);
    const pruned = prune(stored, now());
    if (Object.keys(pruned).length !== Object.keys(stored).length) {
      writeRecords(storageKey, pruned);
    }
  }

  return {
    has(key) {
      if (memory.has(key)) return true;
      // Re-read so a mark made by another tab of the same user counts too.
      if (storageKey && key in readRecords(storageKey)) {
        memory.add(key);
        return true;
      }
      return false;
    },
    mark(key) {
      memory.add(key);
      if (!storageKey) return;
      const at = now();
      writeRecords(storageKey, prune({ ...readRecords(storageKey), [key]: at }, at));
    },
  };
}
