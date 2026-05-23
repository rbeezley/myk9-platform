import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapTree } from './showMapTypes';
import type { EntryLike } from './attention';

export type ShowDeskPendingSignalId =
  | 'entries-waiting-review'
  | 'entries-waiting-checkin'
  | 'classes-needing-signature'
  | 'results-pending-closeout';

export type ShowDeskPendingSignalPriority = 'highest' | 'high' | 'medium';

export interface ShowDeskPendingSignal {
  id: ShowDeskPendingSignalId;
  count: number;
  label: string;
  priority: ShowDeskPendingSignalPriority;
}

export interface ComputeShowDeskPendingSignalsInput {
  tree: ShowMapTree;
  entries: readonly EntryLike[];
}

const PRIORITY_ORDER: Record<ShowDeskPendingSignalPriority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
};

function lower(value: string | null | undefined): string {
  return (value ?? '').toLowerCase();
}

function countEntriesWaitingReview(entries: readonly EntryLike[]): number {
  return entries.filter(entry => lower(entry.entry_status) === 'submitted').length;
}

function countEntriesWaitingCheckIn(entries: readonly EntryLike[]): number {
  // INTENT: Treat missing / null / empty / 'no-status' all as "not yet checked in".
  // Real DB rows often arrive with null check_in_status before the gate steward has
  // touched the entry; mappers preserve that null. Narrowing to literal 'no-status'
  // would undercount the chip on most shows.
  return entries.filter(entry => {
    const status = lower(entry.check_in_status);
    return status === '' || status === 'no-status';
  }).length;
}

function countClassesByWrapUpValue(tree: ShowMapTree, values: readonly string[]): number {
  const targets = new Set(values);
  let count = 0;
  for (const node of Object.values(tree.nodesById)) {
    if (node.type !== 'class') continue;
    const value = node.wrapUpStatus?.value;
    if (value && targets.has(value)) count++;
  }
  return count;
}

export function computeShowDeskPendingSignals({
  tree,
  entries,
}: ComputeShowDeskPendingSignalsInput): ShowDeskPendingSignal[] {
  const signals: ShowDeskPendingSignal[] = [];

  const waitingReview = countEntriesWaitingReview(entries);
  if (waitingReview > 0) {
    signals.push({
      id: 'entries-waiting-review',
      count: waitingReview,
      priority: 'highest',
      label: `${waitingReview} ${waitingReview === 1 ? 'entry' : 'entries'} waiting for review`,
    });
  }

  const waitingCheckIn = countEntriesWaitingCheckIn(entries);
  if (waitingCheckIn > 0) {
    signals.push({
      id: 'entries-waiting-checkin',
      count: waitingCheckIn,
      priority: 'high',
      label: `${waitingCheckIn} ${waitingCheckIn === 1 ? 'entry' : 'entries'} waiting for check-in`,
    });
  }

  const needingSignature = countClassesByWrapUpValue(tree, [
    SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
  ]);
  if (needingSignature > 0) {
    signals.push({
      id: 'classes-needing-signature',
      count: needingSignature,
      priority: 'high',
      label: `${needingSignature} ${
        needingSignature === 1 ? 'class needs' : 'classes need'
      } judge signature`,
    });
  }

  const pendingCloseout = countClassesByWrapUpValue(tree, [
    SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
    SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
  ]);
  if (pendingCloseout > 0) {
    signals.push({
      id: 'results-pending-closeout',
      count: pendingCloseout,
      priority: 'medium',
      label: `${pendingCloseout} ${
        pendingCloseout === 1 ? 'result' : 'results'
      } pending closeout`,
    });
  }

  return signals.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
