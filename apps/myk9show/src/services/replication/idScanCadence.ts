/**
 * Cadence of the unscoped id scans of `dogs`, `dog_registrations` and `clubs`
 * (MYK9-1302).
 *
 * The three tables prune rows the server no longer shows by reading the
 * COMPLETE live id set, which the incremental delta can never observe (RLS
 * hides soft-deleted rows). Running those reads after every 60 s pass dominated
 * show-day statement time, so each runs when due instead:
 *
 * - on the first pass after a reload (no stamp for the table),
 * - when the engine pass was a `full-sync`: the replica was empty, the 24 h
 *   forced sync fell due, or (dog_registrations, which carries an engine row
 *   count with `detectOverReplica`) the count disagreed with the local rows,
 *   about every 10 minutes (MYK9-1301). A registration removed on the server
 *   therefore reaches its scan within about 10 minutes while the count runs.
 *   Dogs have no count yet (MYK9-1321), so their bound is the hour below,
 * - when the last COMPLETED scan is 60 minutes old, or the device clock moved
 *   backwards,
 * - after an account change (the stamps are forgotten, MYK9-1139).
 *
 * A scan that fails, returns incomplete, or (registrations) keeps rows for
 * "the next pass" leaves the debt owed. `features.replicationDogIdCadence ===
 * false` restores the every-pass scans. The scans stay unscoped for staff:
 * secretaries see every dog, including mail-in entries.
 */

import { features } from '@/config/features';
import { onAccountBoundary } from '@/lib/accountBoundary';

/** Longest a removal can stay in the replica when no count runs: one hour. */
export const ID_SCAN_INTERVAL_MS = 60 * 60_000;

// Device-session memory, not persisted: a reload starts empty, which only means
// the first pass scans, the safe direction.
const lastCompletedAt = new Map<string, number>();
// Bumped by every reset: a scan that began under the previous account must not
// stamp the new one (the account boundary can fire while a pass is in flight).
let epoch = 0;

/** The epoch a scan starts under; hand it back to `markIdScanCompleted`. */
export function idScanEpoch(): number {
  return epoch;
}

/** Stamp key for one table and, for owner-scoped dogs, one scope. */
export function idScanKey(tableName: string, scopeValue?: string): string {
  return scopeValue ? `${tableName}:${scopeValue}` : tableName;
}

/**
 * True when this pass must run the id scan. A scan that is due owes its debt
 * until it completes: the stamp is dropped here, so a due scan that then fails
 * (or is skipped) leaves the next pass scanning again instead of waiting out
 * the hour behind a stamp that predates the trigger (Codex, MYK9-1302).
 */
export function shouldRunIdScan(
  key: string,
  input: { result: { operation?: string }; now?: number }
): boolean {
  if (!features.replicationDogIdCadence) return true;
  const stamp = lastCompletedAt.get(key);
  if (stamp === undefined) return true;
  const now = input.now ?? Date.now();
  const due =
    input.result.operation === 'full-sync' ||
    // A clock that moved backwards must never hold the scan past its bound.
    now < stamp ||
    now - stamp >= ID_SCAN_INTERVAL_MS;
  if (due) lastCompletedAt.delete(key);
  return due;
}

/**
 * Call ONLY after a scan completed; an aborted or partial scan leaves the debt.
 * A stamp from a scan that started before a reset (`startedEpoch` stale) is
 * dropped, so the next account's first pass still scans.
 */
export function markIdScanCompleted(
  key: string,
  startedEpoch: number,
  now: number = Date.now()
): void {
  if (startedEpoch !== epoch) return;
  lastCompletedAt.set(key, now);
}

export function resetIdScanCadence(): void {
  lastCompletedAt.clear();
  epoch += 1;
}

// The replicas are not cleared on sign-out (MYK9-1139), so the next account on
// the device must not inherit the last account's stamp: rows RLS now hides from
// it would otherwise stay readable until the hour is up.
onAccountBoundary(resetIdScanCadence);
