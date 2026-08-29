const PENDING_PREFIX = 'myk9:class-completion-pending:';
const CELEBRATED_PREFIX = 'myk9:class-completion-celebrated:';

export const COMPLETION_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CELEBRATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const pendingInMemory = new Map<string, number>();
const celebratedInMemory = new Map<string, number>();

function removeStoredFlag(prefix: string, classId: string): void {
  try {
    localStorage.removeItem(`${prefix}${classId}`);
  } catch {
    // In-memory state remains authoritative for the current app session.
  }
}

function readStoredTimestamp(prefix: string, classId: string): number | null {
  try {
    const timestamp = Number(localStorage.getItem(`${prefix}${classId}`));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  } catch {
    return null;
  }
}

function readFreshFlag(
  prefix: string,
  classId: string,
  memory: Map<string, number>,
  maxAgeMs: number,
  now: number
): number | null {
  const timestamp = memory.get(classId) ?? readStoredTimestamp(prefix, classId);
  if (timestamp === null || now - timestamp > maxAgeMs) {
    memory.delete(classId);
    removeStoredFlag(prefix, classId);
    return null;
  }
  return timestamp;
}

function pruneCompletionFlags(now: number): void {
  for (const [classId, timestamp] of pendingInMemory) {
    if (now - timestamp > COMPLETION_INTENT_MAX_AGE_MS) pendingInMemory.delete(classId);
  }
  for (const [classId, timestamp] of celebratedInMemory) {
    if (now - timestamp > CELEBRATION_RETENTION_MS) celebratedInMemory.delete(classId);
  }

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key) continue;

      const isPending = key.startsWith(PENDING_PREFIX);
      const isCelebrated = key.startsWith(CELEBRATED_PREFIX);
      if (!isPending && !isCelebrated) continue;

      const timestamp = Number(localStorage.getItem(key));
      const maxAge = isPending ? COMPLETION_INTENT_MAX_AGE_MS : CELEBRATION_RETENTION_MS;
      if (!Number.isFinite(timestamp) || timestamp <= 0 || now - timestamp > maxAge) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage cleanup is best-effort; completion remains functional in memory.
  }
}

/** Record a fresh final-score intent for this device and class. */
/**
 * Clears the module-scope memos. TEST-ONLY.
 *
 * `pendingInMemory` / `celebratedInMemory` are module scope, so a celebration
 * claimed by one test file stays claimed for every later file in the same
 * worker. Clearing `localStorage` alone does not reach them, which made
 * "celebrates a final-score intent exactly once" pass or fail depending on file
 * order — invisible locally, random in CI, which runs `--sequence.shuffle`.
 *
 * `.clear()` is O(1) deliberately: a reset that walks the accumulated keys would
 * grow with the leak it exists to undo.
 */
export function __resetClassCompletionMemoForTests(): void {
  pendingInMemory.clear();
  celebratedInMemory.clear();
}

export function markClassCompletionPending(classId: string): void {
  const now = Date.now();
  pruneCompletionFlags(now);
  pendingInMemory.set(classId, now);
  try {
    localStorage.setItem(`${PENDING_PREFIX}${classId}`, String(now));
  } catch {
    // In-memory state preserves the current scoring session when storage is unavailable.
  }
}

/** Consume a fresh, not-yet-celebrated completion intent exactly once. */
export function claimClassCompletionCelebration(classId: string): boolean {
  const now = Date.now();
  pruneCompletionFlags(now);
  const pendingAt = readFreshFlag(
    PENDING_PREFIX,
    classId,
    pendingInMemory,
    COMPLETION_INTENT_MAX_AGE_MS,
    now
  );
  if (pendingAt === null) return false;

  const celebratedAt = readFreshFlag(
    CELEBRATED_PREFIX,
    classId,
    celebratedInMemory,
    CELEBRATION_RETENTION_MS,
    now
  );
  pendingInMemory.delete(classId);
  removeStoredFlag(PENDING_PREFIX, classId);
  if (celebratedAt !== null) return false;

  celebratedInMemory.set(classId, now);
  try {
    localStorage.setItem(`${CELEBRATED_PREFIX}${classId}`, String(now));
  } catch {
    // The module-level map still prevents replay for this app session.
  }
  return true;
}
