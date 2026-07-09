import type { DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from './replication-fallback';

export interface ReadResult<T> {
  data: T;
  error: DatabaseError | null;
}

/**
 * A replication read result that may additionally report the IDs of rows the
 * local replica has soft-deleted but not yet synced. Only meaningful with
 * `verifyOnlineWhenEmpty` (see below); ordinary callers keep returning a plain
 * {@link ReadResult}.
 */
export interface ReplicationReadResult<T> extends ReadResult<T> {
  /**
   * IDs of rows present in the LOCAL replica as soft-delete tombstones — a
   * queued delete not yet synced to the server. When the empty-result online
   * read runs, rows whose id is in this list are removed from the online result
   * so a stale server row (the server hasn't seen the delete yet) can't
   * resurrect a just-deleted row.
   */
  locallyDeletedIds?: readonly string[];
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
   * authoritative online read, but excludes any rows the local replica has
   * already soft-deleted (see `locallyDeletedIds`). It runs the online read when:
   *   - the replication result is empty, AND
   *   - the replication call succeeded (not a PostgREST-fallback result), AND
   *   - there was no error.
   *
   * The tombstone exclusion — not a coarse "any local rows?" count — is what
   * makes this correct across scopes that span replication units. A dog's
   * entries live across many per-show stores, so a nonzero local row count for
   * the dog does NOT prove the whole dog scope is warm: it may hold a pending
   * delete in one synced show while a live entry sits in an unsynced show. The
   * ID exclusion surfaces that genuinely-live remote entry while still refusing
   * to resurrect the locally-deleted one from a stale server row. For a
   * scope-equals-replication-unit read (per-show), the same exclusion is a
   * strict superset of "trust the local delete". Online-verify failures are
   * swallowed; the safe default is the original empty result.
   */
  verifyOnlineWhenEmpty?: boolean;
  /**
   * How to read a row's identity for tombstone exclusion. Defaults to `row.id`.
   * Only consulted when `verifyOnlineWhenEmpty` runs an online read AND the
   * replication callback reported `locallyDeletedIds`.
   */
  rowId?: (row: unknown) => string;
}

function isEmptyReadData(data: unknown): boolean {
  if (Array.isArray(data)) return data.length === 0;
  return data == null;
}

function defaultRowId(row: unknown): string {
  return String((row as { id?: unknown }).id);
}

export async function readWithReplicationFallback<T>({
  replication,
  postgrest,
  table,
  operation,
  errorData,
  verifyOnlineWhenEmpty,
  rowId,
}: ReadWithReplicationFallbackOptions<T>): Promise<ReadResult<T>> {
  let locallyDeletedIds: readonly string[] | undefined;
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
        locallyDeletedIds = r.locallyDeletedIds;
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
    !isEmptyReadData(result.data)
  ) {
    return result;
  }

  // Empty local result: the scope may simply not have synced (entries replicate
  // per-show). Verify against the authoritative online read, then drop any rows
  // the local replica has already tombstoned so a stale server row can't
  // resurrect a just-deleted entry. Swallow failures (offline, RLS edge case) —
  // the safe default is the original empty replication result.
  try {
    const online = await postgrest();
    if (online.error || !Array.isArray(online.data)) return online;
    const deleted = new Set(locallyDeletedIds ?? []);
    if (deleted.size === 0) return online;
    const idOf = rowId ?? defaultRowId;
    const kept = (online.data as unknown[]).filter(row => !deleted.has(idOf(row)));
    return { data: kept as T, error: online.error };
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
