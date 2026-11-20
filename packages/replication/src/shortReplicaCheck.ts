import { abortableWait } from './abortable';
import { countCoveredRows } from './replicaCoverage';
import type { SyncReplicatedTableAdapter, SyncScope } from './syncReplicatedTable.types';
import { observeShortReplica } from './shortReplicaReporter';
import type { ShortReplicaReport } from './types';

export interface ShortReplicaCheckInput {
  tableName: string;
  scopeValue: string | undefined;
  /** The count this pass took before its download. */
  expectedRemoteRows: number;
  /** The scope's rows on this device after the download was written. */
  localRows: readonly object[];
  /** Server rows whose DELETE is queued here: the server still counts them. */
  pendingDeleteIds: ReadonlySet<string> | undefined;
  /** The adapter has a delete queue that could not be read: nothing can be called missing. */
  deleteQueueUnreadable?: boolean;
  /**
   * Server rows the download rightly did not store: another account's unsent
   * work sits on them, or the adapter skips them on purpose.
   */
  heldBackIds: ReadonlySet<string>;
  /** The ids the server's count includes: a held-back row outside it stands in for nothing. */
  coveredServerIds: ReadonlySet<string>;
  /** A second count of the same scope; undefined when it could not be taken. */
  recount: () => Promise<number | undefined> | undefined;
}

export interface ShortReplicaCheck {
  /** The count to trust and persist: the second one when it was taken and sound. */
  serverCount: number;
  /** Set only when a second count agrees the device is short. */
  short: ShortReplicaReport | null;
}

/**
 * Rows this device accounts for after a full download (MYK9-2254): the
 * coverage rule the count check uses, plus the server rows held back on
 * purpose, when the server's count includes them (a skipped soft-deleted
 * tombstone cannot stand in for a missing active row). A held-back id that is
 * already a local row is counted once.
 */
export function countAccountedRows(
  localRows: readonly object[],
  pendingDeleteIds: ReadonlySet<string> | undefined,
  heldBackIds: ReadonlySet<string>,
  coveredServerIds: ReadonlySet<string>
): number {
  const known = new Set<string>(pendingDeleteIds ?? []);
  for (const row of localRows) {
    const { id } = row as { id?: unknown };
    if (id !== undefined && id !== null) known.add(String(id));
  }
  let heldBack = 0;
  for (const id of heldBackIds) if (coveredServerIds.has(id) && !known.has(id)) heldBack++;
  return countCoveredRows(localRows, pendingDeleteIds) + heldBack;
}

/**
 * A full download that leaves the device short of the server's count is a
 * failure. The first count can be stale-high (a row deleted on the server
 * between the count and the fetch), so a short device is confirmed with a
 * second count before it is called short. A second count that cannot be taken
 * confirms nothing: no alarm and no all-clear. Every settled verdict goes to
 * the app's one reporter (see shortReplicaReporter.ts).
 */
export async function checkShortReplica(input: ShortReplicaCheckInput): Promise<ShortReplicaCheck> {
  if (input.deleteQueueUnreadable) return { serverCount: input.expectedRemoteRows, short: null };
  const deviceCount = countAccountedRows(
    input.localRows,
    input.pendingDeleteIds,
    input.heldBackIds,
    input.coveredServerIds
  );
  const observe = (short: ShortReplicaReport | null) =>
    observeShortReplica({ tableName: input.tableName, scope: input.scopeValue, short });
  if (deviceCount >= input.expectedRemoteRows) {
    observe(null);
    return { serverCount: input.expectedRemoteRows, short: null };
  }
  let second: number | undefined;
  try {
    second = await input.recount();
  } catch {
    second = undefined;
  }
  if (typeof second !== 'number' || !Number.isFinite(second) || second < 0) {
    return { serverCount: input.expectedRemoteRows, short: null };
  }
  const serverCount = Math.floor(second);
  const short: ShortReplicaReport | null =
    deviceCount < serverCount
      ? { tableName: input.tableName, scope: input.scopeValue, serverCount, deviceCount }
      : null;
  observe(short);
  return { serverCount, short };
}

/** The second count, bounded by the pass signal like the first. */
export function recountRemoteRows(
  adapter: SyncReplicatedTableAdapter<any, any>,
  scope: SyncScope,
  signal?: AbortSignal
): Promise<number | undefined> {
  return abortableWait(
    Promise.resolve(adapter.getRemoteRowCount?.({ scope, ...(signal ? { signal } : {}) })),
    signal
  );
}

export function shortReplicaMessage(report: ShortReplicaReport): string {
  return `myK9Show holds ${report.serverCount} rows but this device saved ${report.deviceCount}.`;
}
