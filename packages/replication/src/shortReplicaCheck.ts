import { countCoveredRows } from './replicaCoverage';
import { abortableWait } from './abortable';
import { scopeStampDirective } from './rowOwnership';
import type { ReplicatedTable } from './core/ReplicatedTable';
import type { SyncReplicatedTableAdapter, SyncScope } from './syncReplicatedTable.types';

/**
 * MYK9-2254: a full download that leaves the device short of the server's count.
 * The engine stays logger-free: it reports through the result and this observer,
 * which the app registers once at startup.
 */
export interface ShortReplica {
  table: string;
  scope: string | undefined;
  serverCount: number;
  deviceCount: number;
}

export interface ShortReplicaObserver {
  /** A confirmed short download. Called on every such pass; the observer dedupes. */
  onShort(info: ShortReplica): void;
  /** A counted full download came back whole: the table and scope are no longer short. */
  onWhole(table: string, scope: string | undefined): void;
}

let observer: ShortReplicaObserver | null = null;

export function configureShortReplicaObserver(next: ShortReplicaObserver | null): void {
  observer = next;
}

function notify(call: (o: ShortReplicaObserver) => void): void {
  try {
    if (observer) call(observer);
  } catch {
    // An alerting failure must never fail a sync.
  }
}

interface CheckInput<TRemote, TLocal extends { id: string }> {
  table: ReplicatedTable<TLocal>;
  adapter: SyncReplicatedTableAdapter<TRemote, TLocal>;
  scope: SyncScope;
  signal: AbortSignal | undefined;
  /** The count taken at the start of this pass. */
  serverCount: number;
  /** This account's rows in the scope; read after the download was written. */
  getLocalRows: () => Promise<readonly object[]>;
  pendingDeleteIds: ReadonlySet<string> | undefined;
  /** Server rows rightly not held: another account's unsent work, or an adapter skip. */
  skippedIds: ReadonlySet<string>;
}

/**
 * After a forced full download on a pass that took a count: is the device still
 * short? A short answer is confirmed with a second count, because the first can
 * be stale-high (a row deleted on the server between the count and the fetch).
 * A second count that fails settles nothing, so it neither fails nor alerts.
 */
export async function findShortReplica<TRemote, TLocal extends { id: string }>(
  input: CheckInput<TRemote, TLocal>
): Promise<ShortReplica | undefined> {
  const { table, adapter, scope, signal, serverCount } = input;
  const localRows = await input.getLocalRows();
  const accounted = new Set(input.skippedIds);
  for (const id of input.pendingDeleteIds ?? []) accounted.add(id);
  const deviceCount = countCoveredRows(localRows, accounted);
  const name = table.getTableName();
  if (deviceCount >= serverCount) {
    notify(o => o.onWhole(name, scope.value));
    return undefined;
  }
  let confirmed: number | undefined;
  try {
    confirmed = await abortableWait(
      Promise.resolve(adapter.getRemoteRowCount?.(signal ? { scope, signal } : { scope })),
      signal
    );
  } catch {
    confirmed = undefined;
  }
  if (typeof confirmed !== 'number' || !Number.isFinite(confirmed)) return undefined;
  if (deviceCount >= confirmed) {
    notify(o => o.onWhole(name, scope.value));
    return undefined;
  }
  const info = { table: name, scope: scope.value, serverCount: confirmed, deviceCount };
  notify(o => o.onShort(info));
  return info;
}

/**
 * Settle a short download: the scope is not whole (the stamp is cleared), the
 * server's count is recorded so the badge reads "not saved", and the status is an
 * error so the offline line offers "Try again". The watermark and the full-sync
 * time stay put, so the next pass downloads in full again. Returns the failure
 * message, or undefined when the device is not short.
 */
export async function failIfShort<TRemote, TLocal extends { id: string }>(
  input: CheckInput<TRemote, TLocal> & {
    forceFullSync: boolean;
    stopIfAborted: () => void;
    accountOwned: boolean;
    writtenIds: readonly string[];
    authUserId: string | null;
  }
): Promise<{ message: string; info: ShortReplica } | undefined> {
  if (!input.forceFullSync) return undefined;
  // The account changed mid-sync: the rows read now are another account's, and the
  // sync fails for that reason instead.
  if (input.accountOwned && (await input.table.getCurrentAuthUserId()) !== input.authUserId) {
    return undefined;
  }
  const info = await findShortReplica(input);
  if (!info) return undefined;
  input.stopIfAborted();
  const { table, scope } = input;
  const message = `The download came back short: this device holds ${info.deviceCount} of ${info.serverCount} rows.`;
  const stamp = input.accountOwned
    ? scopeStampDirective(input.writtenIds, input.authUserId, false)
    : undefined;
  await table.updateSyncMetadata(
    {
      syncStatus: 'error',
      errorMessage: message,
      totalRows: (await input.getLocalRows()).length,
      expectedRemoteRows: info.serverCount,
    },
    { scopeValue: scope.value, ...(stamp ? { scopeSyncedBy: stamp } : {}) }
  );
  return { message, info };
}
