import {
  comparableValue,
  deepEqual,
  type DirtyRowComparePolicy,
} from '../conflict/detectDirtyRowConflict';

/** Drops the queued RPC fields that are not writes; see {@link buildQueuedFieldPruner}. */
export type QueuedFieldPruner = (fields: Record<string, unknown>) => Record<string, unknown>;

/**
 * MYK9-1236: "a write equal to the base is not a write". A queued RPC delta that
 * survives a rebase onto a newer server token must not carry a field whose
 * value is what the write was MADE AGAINST: it changed nothing on the device,
 * so sending it can only overwrite a newer server value the reconcile has just
 * adopted into the cache (a no-op clear, undefined to null, erasing another
 * device's note). Equality is the table's own compare policy, the same
 * `comparableValue` rule conflict detection and the merge use.
 *
 * `base` is the merge base the reconcile judged against, read BEFORE the row's
 * base moves to the server snapshot. `toRemoteFields` maps a local row to the
 * column-keyed shape the queued fields use (the adapter's rebuild). A key the
 * mapping does not cover is kept, as is any field that really changed.
 */
export function buildQueuedFieldPruner<T>(params: {
  base: T;
  toRemoteFields: ((row: T) => Record<string, unknown> | undefined) | undefined;
  comparePolicy: DirtyRowComparePolicy | undefined;
  instantFields: ReadonlySet<string>;
}): QueuedFieldPruner | undefined {
  const { base, toRemoteFields, comparePolicy, instantFields } = params;
  if (!toRemoteFields) return undefined;
  const baseFields = toRemoteFields(base);
  if (!baseFields) return undefined;
  return fields => {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      const unchanged =
        Object.prototype.hasOwnProperty.call(baseFields, key) &&
        deepEqual(
          comparableValue(comparePolicy, key, value),
          comparableValue(comparePolicy, key, baseFields[key]),
          instantFields.has(key)
        );
      if (!unchanged) kept[key] = value;
    }
    return kept;
  };
}
