import type { MutationManager, PendingMutation, ReplicatedTable } from '@myk9/replication';
import { SHOW_USES_FIELD_COLUMNS } from './showUsesColumns';

/**
 * MYK9-1721: a "This show uses…" switch has one writer, this device's queued write for it.
 * A server copy pulled while that write is unconfirmed holds the value from before it, and the
 * generic three-way merge cannot tell: a switch flipped off then on equals its base, so the
 * merge reads it as untouched, takes the server's value, and the rebase then rewrites the
 * queued writes to it too (the server ends on the old value).
 */

/** The replica fields whose uses_* column a queued write of this device still sets. */
export function pendingUsesFields(pending: readonly PendingMutation[]): string[] {
  const columns = new Set<string>();
  for (const mutation of pending) {
    if (mutation.operation === 'DELETE') continue;
    for (const key of mutation.explicitDataKeys ?? Object.keys(mutation.data)) columns.add(key);
  }
  return SHOW_USES_FIELD_COLUMNS.filter(([, column]) => columns.has(column)).map(
    ([field]) => field
  );
}

/**
 * The server copy with each switch a queued write still owns held at the device's value, so a
 * merge and a queue rebase from it keep that value. Every other field is the server's.
 */
export function withOwnedSwitches<T extends object>(
  remote: T,
  local: object | undefined,
  owned: readonly string[]
): T {
  if (!local || owned.length === 0) return remote;
  const held: Record<string, unknown> = {};
  for (const field of owned) {
    const value = (local as Record<string, unknown>)[field];
    if (value !== undefined) held[field] = value;
  }
  return { ...remote, ...held };
}

type ShowLike = { id: string };
type ReconcileParams<T extends ShowLike> = Parameters<ReplicatedTable<T>['reconcileDirtyRow']>[1];

/** `params` with the server copy holding every switch this device still has a queued write for. */
export async function holdOwnedSwitches<T extends ShowLike>(
  table: ReplicatedTable<T>,
  manager: MutationManager | null,
  id: string,
  params: ReconcileParams<T>
): Promise<ReconcileParams<T>> {
  if (!manager) return params;
  // The read needs a signed-in identity and throws in a token-refresh gap or an account switch.
  // Treat that as "owns nothing", as the core's own pending-mutation read does, so the pull
  // reconciles as it did before rather than failing the whole shows sync on this row.
  const pending = await manager
    .getPendingMutationsForRow(table.getTableName(), id)
    .catch(() => [] as PendingMutation[]);
  const owned = pendingUsesFields(pending);
  if (owned.length === 0) return params;
  const local = (await table.getReplicatedRow(id))?.data;
  return { ...params, remote: withOwnedSwitches(params.remote, local, owned) };
}
