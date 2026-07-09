import type { DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from './replication-fallback';

export interface ReadResult<T> {
  data: T;
  error: DatabaseError | null;
}

/**
 * A replication read result that may additionally report the RAW local row
 * count — the number of matching rows in the local replica BEFORE any
 * tombstone/live filtering. Only meaningful with `verifyOnlineWhenEmpty`
 * (see below); ordinary callers keep returning a plain {@link ReadResult}.
 */
export interface ReplicationReadResult<T> extends ReadResult<T> {
  rawLocalCount?: number;
}

interface ReadWithReplicationFallbackOptions<T> {
  replication: () => Promise<ReplicationReadResult<T>>;
  postgrest: () => Promise<ReadResult<T>>;
  table: string;
  operation: string;
  errorData: T;
  /**
   * Opt-in for per-scope (per-show / per-dog) entry reads whose local replica
   * may legitimately be cold: entries replicate per-show, so a scope the caller
   * hasn't opened this session has an empty local store. Because
   * `withReplicationFallback` only falls back to PostgREST on a THROW — never on
   * a legitimately-shaped-but-empty array — an empty local result would be
   * reported as truth even when the server has rows that simply haven't synced.
   *
   * When enabled, the helper verifies an empty replication result against the
   * authoritative online read. It does so ONLY for a genuinely cold replica:
   *   - the replication result is empty, AND
   *   - the replication call succeeded (not a PostgREST-fallback result), AND
   *   - there was no error, AND
   *   - the RAW local row count is 0 (see `rawLocalCount`).
   *
   * The raw-count gate is the tombstone guard: if the replica HAS rows that were
   * all filtered out as local soft-delete tombstones (a queued delete not yet
   * synced), the empty result is CORRECT and must win over the server — reading
   * PostgREST there would resurrect a just-deleted entry from a stale server row.
   * Online-verify failures are swallowed; the safe default is the empty result.
   *
   * The replication callback MUST report `rawLocalCount` for the tombstone guard
   * to engage; a missing count is treated as 0 (cold), reproducing the original
   * bug for tombstoned rows — so always set it when opting in.
   */
  verifyOnlineWhenEmpty?: boolean;
}

function isEmptyReadData(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  return data == null;
}

export async function readWithReplicationFallback<T>({
  replication,
  postgrest,
  table,
  operation,
  errorData,
  verifyOnlineWhenEmpty,
}: ReadWithReplicationFallbackOptions<T>): Promise<ReadResult<T>> {
  let rawLocalCount: number | undefined;
  // Distinguishes "the result came from the local replica" from "the result came
  // from the PostgREST fallback because replication threw". Only the former is a
  // candidate for empty-verify; a fallback result is already an authoritative
  // online read, so re-querying would be pointless (and could double-count).
  let replicationSucceeded = false;

  let result: ReadResult<T>;
  try {
    result = await withReplicationFallback<ReadResult<T>>(
      async () => {
        const r = await replication();
        rawLocalCount = r.rawLocalCount;
        replicationSucceeded = true;
        return { data: r.data, error: r.error };
      },
      postgrest,
      table,
      operation
    );
  } catch (error) {
    return { data: errorData, error: error as DatabaseError };
  }

  if (
    !verifyOnlineWhenEmpty ||
    !replicationSucceeded ||
    result.error ||
    !isEmptyReadData(result.data) ||
    (rawLocalCount ?? 0) > 0
  ) {
    return result;
  }

  // Genuinely cold local replica: verify against the authoritative online read
  // before reporting an empty result. Swallow failures (offline, RLS edge case)
  // — the safe default is the original empty replication result.
  try {
    return await postgrest();
  } catch {
    return result;
  }
}

export async function loadLookupMap<T>(
  load: () => Promise<T[]>,
  keyFn: (item: T) => string
): Promise<Map<string, T>> {
  const items = await load();
  return new Map(items.map(item => [keyFn(item), item]));
}

export function sortedCopy<T>(items: readonly T[], compare: (a: T, b: T) => number): T[] {
  return [...items].sort(compare);
}

export function compareDateAsc<T>(getDate: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aDate = getDate(a) ?? '';
    const bDate = getDate(b) ?? '';
    return aDate.localeCompare(bDate);
  };
}

export function compareDateDesc<T>(getDate: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aDate = getDate(a) ?? '';
    const bDate = getDate(b) ?? '';
    return bDate.localeCompare(aDate);
  };
}

export function compareStringAsc<T>(getValue: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a) ?? '';
    const bValue = getValue(b) ?? '';
    return aValue.localeCompare(bValue);
  };
}

export function compareStringAscNullsLast<T>(getValue: (item: T) => string | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a);
    const bValue = getValue(b);

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return aValue.localeCompare(bValue);
  };
}

export function compareNumberAscNullsLast<T>(getValue: (item: T) => number | null | undefined) {
  return (a: T, b: T) => {
    const aValue = getValue(a);
    const bValue = getValue(b);

    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return aValue - bValue;
  };
}
