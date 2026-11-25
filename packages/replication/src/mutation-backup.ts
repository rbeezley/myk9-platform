import { MUTATION_OPERATIONS, type PendingMutation } from './types';

/**
 * The localStorage mutation backup is a JOURNAL: one key per queued mutation,
 * plus a tombstone key for each mutation that was uploaded, discarded or
 * cleared (MYK9-2360).
 *
 * localStorage writes are synchronous and per key, so no writer (this tab or
 * another) can erase a mutation it did not mean to touch, which a whole-queue
 * snapshot rewrite did. Entries are only ever added or updated from IndexedDB,
 * and only removed by name. A tombstone outlives its entry so a writer that read
 * the row just before it was uploaded cannot put it back, and a restore never
 * replays it.
 */
export const JOURNAL_ENTRY_PREFIX = 'replication_mutation_backup:';
export const JOURNAL_TOMBSTONE_PREFIX = 'replication_mutation_backup_gone:';
/** The pre-journal single-key snapshot. Read once for migration, then removed. */
export const MUTATION_BACKUP_STORAGE_KEY = 'replication_mutation_backup';
/** Tombstones are kept this long, far past any in-flight read of the row they name. */
export const JOURNAL_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MutationBackupParseResult {
  /** Pending (not-yet-synced) mutations — restored into the active queue. */
  mutations: PendingMutation[];
  /**
   * Dead-lettered mutations (`status === 'failed'`) — restored into the failed
   * store, NOT the active queue, so they don't auto-retry but survive a DB wipe
   * for the judge to review (retry/discard).
   */
  failedMutations: PendingMutation[];
  malformedCount: number;
  failedCount: number;
  error?: Error;
}

export type MutationJournalStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

function isBackupMutation(value: unknown): value is PendingMutation {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const hasValidOwner =
    !Object.prototype.hasOwnProperty.call(candidate, 'authUserId') ||
    (typeof candidate.authUserId === 'string' && candidate.authUserId.trim().length > 0);
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tableName === 'string' &&
    typeof candidate.operation === 'string' &&
    MUTATION_OPERATIONS.includes(candidate.operation as PendingMutation['operation']) &&
    typeof candidate.rowId === 'string' &&
    hasValidOwner
  );
}

/** Parse the legacy single-key snapshot (a JSON array of mutations). */
export function parseMutationBackup(raw: string | null): MutationBackupParseResult {
  if (!raw) {
    return { mutations: [], failedMutations: [], malformedCount: 0, failedCount: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      mutations: [],
      failedMutations: [],
      malformedCount: 0,
      failedCount: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { mutations: [], failedMutations: [], malformedCount: 0, failedCount: 0 };
  }

  return splitByStatus(parsed);
}

function splitByStatus(values: unknown[]): MutationBackupParseResult {
  const valid = values.filter(isBackupMutation);
  const mutations = valid.filter(mutation => mutation.status !== 'failed');
  const failedMutations = valid.filter(mutation => mutation.status === 'failed');
  return {
    mutations,
    failedMutations,
    malformedCount: values.length - valid.length,
    failedCount: failedMutations.length,
  };
}

function storageKeys(storage: MutationJournalStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
}

function isTombstoned(storage: MutationJournalStorage, id: string): boolean {
  return storage.getItem(JOURNAL_TOMBSTONE_PREFIX + id) !== null;
}

/**
 * Add or update the journal entry of each mutation. Never removes anything, so
 * it is safe outside the upload lock. A tombstoned id is skipped: the check and
 * the write are one synchronous step.
 */
export function upsertJournalEntries(
  storage: MutationJournalStorage,
  mutations: readonly PendingMutation[]
): void {
  for (const mutation of mutations) {
    if (isTombstoned(storage, mutation.id)) continue;
    const key = JOURNAL_ENTRY_PREFIX + mutation.id;
    const value = JSON.stringify(mutation);
    if (storage.getItem(key) !== value) storage.setItem(key, value);
  }
}

/** Tombstone and remove the named entries. */
export function removeJournalEntries(
  storage: MutationJournalStorage,
  ids: Iterable<string>,
  now = Date.now()
): void {
  for (const id of ids) {
    storage.setItem(JOURNAL_TOMBSTONE_PREFIX + id, String(now));
    storage.removeItem(JOURNAL_ENTRY_PREFIX + id);
  }
}

/**
 * Every live (not tombstoned) mutation in the journal, plus any still in the
 * legacy snapshot. An unreadable entry counts as malformed; it never hides the
 * others.
 */
export function readMutationJournal(storage: MutationJournalStorage): MutationBackupParseResult {
  const legacy = parseMutationBackup(storage.getItem(MUTATION_BACKUP_STORAGE_KEY));
  const values: unknown[] = [];
  let unreadable = 0;
  const seen = new Set<string>();
  for (const key of storageKeys(storage)) {
    if (!key.startsWith(JOURNAL_ENTRY_PREFIX)) continue;
    const id = key.slice(JOURNAL_ENTRY_PREFIX.length);
    if (isTombstoned(storage, id)) continue;
    try {
      values.push(JSON.parse(storage.getItem(key) ?? 'null'));
      seen.add(id);
    } catch {
      unreadable++;
    }
  }
  for (const mutation of [...legacy.mutations, ...legacy.failedMutations]) {
    if (!seen.has(mutation.id) && !isTombstoned(storage, mutation.id)) values.push(mutation);
  }
  const result = splitByStatus(values);
  return {
    ...result,
    malformedCount: result.malformedCount + unreadable + legacy.malformedCount,
    ...(legacy.error && { error: legacy.error }),
  };
}

/**
 * Housekeeping, under the upload lock: move the legacy snapshot into the
 * journal, drop entries that carry a tombstone, and expire old tombstones.
 * Returns what the legacy snapshot could not supply, since it is gone after.
 */
export function compactMutationJournal(
  storage: MutationJournalStorage,
  now = Date.now()
): Pick<MutationBackupParseResult, 'error' | 'malformedCount'> {
  let dropped: Pick<MutationBackupParseResult, 'error' | 'malformedCount'> = { malformedCount: 0 };
  const legacyRaw = storage.getItem(MUTATION_BACKUP_STORAGE_KEY);
  if (legacyRaw !== null) {
    const legacy = parseMutationBackup(legacyRaw);
    upsertJournalEntries(storage, [...legacy.mutations, ...legacy.failedMutations]);
    storage.removeItem(MUTATION_BACKUP_STORAGE_KEY);
    dropped = {
      malformedCount: legacy.malformedCount,
      ...(legacy.error && { error: legacy.error }),
    };
  }
  for (const key of storageKeys(storage)) {
    if (!key.startsWith(JOURNAL_TOMBSTONE_PREFIX)) continue;
    storage.removeItem(JOURNAL_ENTRY_PREFIX + key.slice(JOURNAL_TOMBSTONE_PREFIX.length));
    const at = Number(storage.getItem(key));
    if (!Number.isFinite(at) || now - at > JOURNAL_TOMBSTONE_TTL_MS) storage.removeItem(key);
  }
  return dropped;
}
