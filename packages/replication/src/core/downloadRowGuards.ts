/**
 * The per-row decisions a bulk download write makes before its put: whether a
 * download leaves the stored row as it is, and whether an older download must
 * be skipped for the newer row the device holds.
 */

import type { ReplicatedRow } from '../types';
import { isOlderThanRow } from './ReplicatedTableRowState';

/** Structural equality over the JSON-shaped data a replicated row carries. */
function sameRowData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => sameRowData(item, right[i]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).filter(key => leftRecord[key] !== undefined);
  const rightKeys = Object.keys(rightRecord).filter(key => rightRecord[key] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    key => key in rightRecord && sameRowData(leftRecord[key], rightRecord[key])
  );
}

/**
 * True when storing this download would leave the row as the device already
 * holds it: same data, same server version, same owner, and the row is a clean
 * synced copy (a conflict or pending-delete row is always rewritten). Such a
 * row still gets its bookkeeping put (`lastSyncedAt` feeds the stale-row
 * cleanup), but it is not a change (MYK9-1332).
 */
export function downloadLeavesRowAsIs<T>(
  existingRow: ReplicatedRow<T> | undefined,
  data: T,
  serverVersion: number | undefined,
  ownerAuthUserId: string | undefined
): boolean {
  if (!existingRow || existingRow.isDirty || existingRow.syncStatus !== 'synced') return false;
  if (existingRow.serverVersion !== serverVersion) return false;
  if (existingRow.ownerAuthUserId !== ownerAuthUserId) return false;
  return sameRowData(existingRow.data, data);
}

/**
 * Whether a download older than the stored row must be skipped. A row owned by
 * any account keeps the guard: this account's own row can hold an acknowledged
 * local write (MYK9-1050), and another account's newer row is the shared-device
 * case MYK9-1148 protects. Only an OWNERLESS row on an account-owned table that
 * records no upload of this device's own is overwritten (MYK9-1632): a cache from
 * before MYK9-1133, which keeping would leave foreign forever after a reseed or
 * restore. An ownerless row CAN also come from a write made while the account
 * was unsettled; if its acknowledged UPDATE moved the server version
 * (`lastOwnUpload`), it keeps the guard. An acknowledged INSERT needs none: a
 * download read before it does not contain the row. Tables written without an
 * owner keep the original rule.
 *
 * `versionAtFetch` is the row's serverVersion when a full sync's fetch began
 * (MYK9-1633). Every legitimate newer row (an acknowledged own write, a
 * realtime or refetch write) was stored AFTER that read began, so it moved the
 * version. Still holding it means the server returned an older copy than one it
 * had already given this device: its numbering went backwards (a restore,
 * delete-and-recreate, a repair). The server copy then wins for this account's
 * own rows; another account's row keeps the guard (MYK9-1148).
 */
export function shouldKeepNewerRow<T extends { id: string }>(
  existingRow: ReplicatedRow<T> | undefined,
  remoteServerVersion: number | undefined,
  ownerAuthUserId: string | undefined,
  versionAtFetch?: number
): boolean {
  if (!existingRow || !isOlderThanRow(existingRow, remoteServerVersion)) return false;
  if (
    versionAtFetch !== undefined &&
    versionAtFetch === existingRow.serverVersion &&
    existingRow.ownerAuthUserId === ownerAuthUserId
  ) {
    return false;
  }
  return (
    ownerAuthUserId === undefined ||
    existingRow.ownerAuthUserId !== undefined ||
    existingRow.lastOwnUpload !== undefined
  );
}
