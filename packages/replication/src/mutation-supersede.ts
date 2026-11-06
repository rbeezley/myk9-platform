import { compareMutationOrder } from './mutation-ordering';
import type { PendingMutation } from './types';

/** The row key rides in every direct UPDATE payload; it is never a written value. */
const ROW_KEY = 'id';

export interface SupersedeResult {
  /** Older queued writes that still carry columns of their own, rewritten without the rest. */
  rewritten: PendingMutation[];
  /** Ids of older queued writes left with nothing to send. */
  removed: string[];
  /** The queue for the row after both. */
  remaining: PendingMutation[];
}

/** What a mutation sends, as a column set, and how to rebuild it without some columns. */
interface SentColumns {
  /** Mutations with equal kinds write the same column space. */
  kind: string;
  columns: Record<string, unknown>;
  without(columns: Record<string, unknown>): PendingMutation;
}

/**
 * A direct UPDATE sends `data`; a field-delta RPC sends `rpc.fields` (its `data` is the whole
 * local row, so it is not compared). A baked-args RPC, or anything else, has no comparable set.
 */
function sentColumns(mutation: PendingMutation): SentColumns | undefined {
  if (mutation.operation !== 'UPDATE') return undefined;
  const { rpc } = mutation;
  if (rpc === undefined) {
    return {
      kind: 'update',
      columns: mutation.data,
      without: data => ({
        ...mutation,
        data,
        ...(mutation.explicitDataKeys !== undefined && {
          // Drop only the keys removed from `data`; keep any it never carried.
          explicitDataKeys: mutation.explicitDataKeys.filter(
            key => key in data || !(key in mutation.data)
          ),
        }),
      }),
    };
  }
  if (rpc.args !== undefined || rpc.fields === undefined) return undefined;
  return {
    kind: `rpc:${rpc.name}`,
    columns: rpc.fields,
    without: fields => ({ ...mutation, rpc: { ...rpc, fields } }),
  };
}

/**
 * Last local write wins, per column (MYK9-1721). When `acknowledged` has reached the server,
 * every OLDER queued write of the same kind for the same row and owner loses the columns it
 * set: sending them now would replay a value the user has since replaced. An older write
 * normally uploads first, so one is still queued here only when the server turned it away (an
 * OCC rejection in backoff); restamped onto the new token, it used to overwrite the newer value.
 * A write left with nothing to send is removed. Pure.
 */
export function supersedeOlderQueuedWrites(
  acknowledged: PendingMutation,
  queued: readonly PendingMutation[]
): SupersedeResult {
  const acked = sentColumns(acknowledged);
  const superseding = new Set(
    acked ? Object.keys(acked.columns).filter(key => key !== ROW_KEY) : []
  );
  const rewritten: PendingMutation[] = [];
  const removed: string[] = [];
  const remaining: PendingMutation[] = [];

  for (const candidate of queued) {
    const sent =
      acked !== undefined &&
      candidate.id !== acknowledged.id &&
      candidate.authUserId === acknowledged.authUserId &&
      compareMutationOrder(candidate, acknowledged) < 0
        ? sentColumns(candidate)
        : undefined;
    const stale =
      sent !== undefined &&
      sent.kind === acked?.kind &&
      Object.keys(sent.columns).some(key => superseding.has(key));
    if (!stale) {
      remaining.push(candidate);
      continue;
    }

    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sent.columns)) {
      if (!superseding.has(key)) kept[key] = value;
    }
    if (Object.keys(kept).every(key => key === ROW_KEY)) {
      removed.push(candidate.id);
      continue;
    }
    const next = sent.without(kept);
    rewritten.push(next);
    remaining.push(next);
  }
  return { rewritten, removed, remaining };
}
