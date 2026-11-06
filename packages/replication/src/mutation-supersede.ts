import { compareMutationOrder } from './mutation-ordering';
import { writtenColumnsOf } from './mutation-written-overlay';
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

/**
 * Last local write wins, per column (MYK9-1721). When `acknowledged` has reached the server,
 * every OLDER queued UPDATE for the same row and owner loses the columns it set: sending them
 * now would replay a value the user has since replaced. An older write normally uploads first,
 * so one is still queued here only when the server turned it away (an OCC rejection in backoff);
 * restamped onto the new token, it used to overwrite the newer value. Pure.
 *
 * Only direct UPDATEs take part, on both sides. An RPC mutation's `data` is the whole local row,
 * not what it sends, so comparing it would drop columns it never wrote; RPC deltas keep their own
 * OCC path (the lifetime cap in mutation-occ-rejection).
 */
export function supersedeOlderQueuedWrites(
  acknowledged: PendingMutation,
  queued: readonly PendingMutation[]
): SupersedeResult {
  const ackedColumns = writtenColumnsOf(acknowledged);
  const superseding = ackedColumns
    ? new Set(Object.keys(ackedColumns).filter(key => key !== ROW_KEY))
    : new Set<string>();
  const rewritten: PendingMutation[] = [];
  const removed: string[] = [];
  const remaining: PendingMutation[] = [];

  for (const candidate of queued) {
    const stale =
      superseding.size > 0 &&
      candidate.id !== acknowledged.id &&
      candidate.authUserId === acknowledged.authUserId &&
      candidate.operation === 'UPDATE' &&
      candidate.rpc === undefined &&
      acknowledged.rpc === undefined &&
      compareMutationOrder(candidate, acknowledged) < 0 &&
      Object.keys(candidate.data).some(key => superseding.has(key));
    if (!stale) {
      remaining.push(candidate);
      continue;
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(candidate.data)) {
      if (!superseding.has(key)) data[key] = value;
    }
    if (Object.keys(data).every(key => key === ROW_KEY)) {
      removed.push(candidate.id);
      continue;
    }
    const next: PendingMutation = {
      ...candidate,
      data,
      ...(candidate.explicitDataKeys !== undefined && {
        explicitDataKeys: candidate.explicitDataKeys.filter(key => !superseding.has(key)),
      }),
    };
    rewritten.push(next);
    remaining.push(next);
  }
  return { rewritten, removed, remaining };
}
