import {
  DEFAULT_IGNORED_FIELDS,
  deepEqual,
  type DirtyRowComparePolicy,
} from './conflict/detectDirtyRowConflict';
import { writtenColumnsOf, type WrittenFieldOverlay } from './mutation-written-overlay';
import type { PendingMutation } from './types';

/**
 * The mutations a device has SENT and not yet finished acknowledging
 * (MYK9-1221). A mutation enters when its request goes out and leaves once its
 * acknowledgement has been applied to the row, so it spans the window in which
 * the server holds the write but the row's merge base does not.
 */
export class InFlightWriteRegistry {
  private readonly sent = new Map<string, PendingMutation>();

  begin(mutation: PendingMutation): void {
    this.sent.set(mutation.id, mutation);
  }

  end(mutationId: string): void {
    this.sent.delete(mutationId);
  }

  forRow(tableName: string, rowId: string): PendingMutation[] {
    return [...this.sent.values()].filter(
      mutation => mutation.tableName === tableName && String(mutation.rowId) === String(rowId)
    );
  }
}

/** What a table hands a reconcile so it can place its in-flight writes in the base. */
export interface InFlightWriteContext {
  mutations: readonly PendingMutation[];
  overlay: WrittenFieldOverlay | undefined;
}

/**
 * The merge base for reconciling a dirty row against a pulled snapshot.
 *
 * Normally the row's own base. When a write of this device is IN FLIGHT and the
 * snapshot is that write landing (the server has applied it, but its
 * acknowledgement has not been processed), the snapshot's difference from the
 * base is the device's own write, not a third party's. The base is then the SAME
 * base the acknowledgement would produce (MYK9-1220): the old base overlaid with
 * the fields the write put on the server, through the table's own mappers.
 *
 * It applies only when the snapshot really shows the write: it is newer than the
 * base, and every field the overlay changes holds the overlaid value (compared
 * the way conflicts are, so a respelled value agrees, and a field the table says
 * the server stamps itself may differ). Anything else, such as the server not
 * having applied the write yet or another device writing a different value, keeps
 * the original base and is judged exactly as before.
 */
export function resolveInFlightMergeBase<T extends object>(params: {
  base: T;
  baseServerVersion: number | undefined;
  remote: T;
  remoteServerVersion: number | undefined;
  inFlight: InFlightWriteContext | undefined;
  instantFields: ReadonlySet<string>;
  comparePolicy?: DirtyRowComparePolicy;
}): T {
  const { base, remote, inFlight, instantFields, comparePolicy } = params;
  if (!inFlight?.overlay || inFlight.mutations.length === 0) return base;
  if (params.remoteServerVersion === undefined) return base;
  if (
    params.baseServerVersion !== undefined &&
    params.remoteServerVersion <= params.baseServerVersion
  ) {
    return base;
  }

  const normalize = comparePolicy?.normalizeValue;
  const serverStamped = new Set(comparePolicy?.serverWinsFields ?? []);
  const view = (field: string, value: unknown) => (normalize ? normalize(field, value) : value);

  let layered: T = base;
  for (const mutation of inFlight.mutations) {
    const written = writtenColumnsOf(mutation);
    if (!written) return base;
    const overlaid = inFlight.overlay(layered, written) as T | undefined;
    if (overlaid === undefined) return base;

    const before = layered as Record<string, unknown>;
    const after = overlaid as Record<string, unknown>;
    const shown = remote as Record<string, unknown>;
    for (const field of Object.keys(after)) {
      if (DEFAULT_IGNORED_FIELDS.has(field) || serverStamped.has(field)) continue;
      const asInstant = instantFields.has(field);
      if (deepEqual(view(field, before[field]), view(field, after[field]), asInstant)) continue;
      if (!deepEqual(view(field, shown[field]), view(field, after[field]), asInstant)) return base;
    }
    layered = overlaid;
  }
  return layered;
}
