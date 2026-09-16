/**
 * MYK9-575 — structural guard against seeding a SHOW-SCOPED replica one row at
 * a time.
 *
 * A show-scoped table (`entries`) is legitimately EMPTY on an account-level
 * surface, and the account-level readers fall through to PostgREST only while
 * the local result is empty. A single stray INSERT makes the store non-empty,
 * the online read is skipped, and an unscoped read returns that one row as the
 * whole dataset (MYK9-573 and the second writer its review found).
 *
 * The sync download path writes through `batchSet`, so the invariant costs it
 * nothing: only `ReplicatedTable.set` is gated, and only when the row is ABSENT
 * (an INSERT). Every deliberate single-row insert must name its reason.
 */
import type { Logger } from '../dependencies';

/**
 * How a refused cold INSERT is reported. `throw` is loud (dev/test); `skip`
 * logs and drops the local write so a show-day mutation is never crashed by
 * the guard — the queued server mutation still uploads.
 */
export type ColdInsertGuardMode = 'throw' | 'skip';

/** Why a `set()` wrote nothing. Never returned for a write that succeeded. */
export type ReplicatedSetSkipReason = 'cold-insert-refused' | 'dirty-row-preserved';

/**
 * The outcome of a `set()`. `written: false` means the local cache row was NOT
 * changed — callers must not report the new value as stored.
 */
export type ReplicatedSetResult =
  | { written: true }
  | { written: false; reason: ReplicatedSetSkipReason };

/**
 * The reason the quota-eviction retry carries. `relieveQuota()` evicts CLEAN
 * rows, so the retry of a legitimate UPDATE can find its own row gone; the
 * first attempt already proved the row existed, and the guard decision belongs
 * to the logical write, not to each attempt.
 */
export const QUOTA_EVICTION_RETRY_REASON =
  'quota-eviction retry (the row existed before relieveQuota)';

export interface ReplicatedSetOptions {
  /**
   * Opt in to INSERTing a row the local store does not hold yet. Required on a
   * show-scoped table; the string is the reason and is logged.
   */
  allowColdInsert?: string;
}

export class ShowScopedColdInsertError extends Error {
  readonly tableName: string;
  readonly rowId: string;

  constructor(tableName: string, rowId: string) {
    super(
      `[${tableName}] Refused a cold single-row INSERT for row ${rowId}. ` +
        `${tableName} replicates per show, so seeding one row from an account-level ` +
        'surface makes the store non-empty and an unscoped read then returns that row ' +
        'as the whole dataset (MYK9-575). Sync writes go through batchSet; a deliberate ' +
        'write-path hydration must pass { allowColdInsert: "<reason>" }.'
    );
    this.name = 'ShowScopedColdInsertError';
    this.tableName = tableName;
    this.rowId = rowId;
  }
}

/**
 * Decide whether a `set()` that would INSERT may proceed.
 *
 * @returns true when the write may proceed. Throws in `throw` mode; returns
 *   false (after logging) in `skip` mode.
 */
export function isColdInsertAllowed(args: {
  /** null for an account-scoped table: no guard. */
  mode: ColdInsertGuardMode | null;
  tableName: string;
  rowId: string;
  options: ReplicatedSetOptions | undefined;
  logger: Logger;
}): boolean {
  const { mode, tableName, rowId, options, logger } = args;
  if (mode === null) return true;

  const reason = options?.allowColdInsert;
  if (reason) {
    logger.log(`[${tableName}] Cold INSERT allowed for row ${rowId}: ${reason}`);
    return true;
  }

  const error = new ShowScopedColdInsertError(tableName, rowId);
  if (mode === 'throw') throw error;
  logger.warn(error.message);
  return false;
}
