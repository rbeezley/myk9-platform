import {
  refundToDecideRemoval,
  type ShowDayReconciliationEntry,
} from '@/features/show-workbench/showDayReconciliationSummary';
import type { EntryRemovalKind } from '@/features/payments/pullReconciliation';
import type { WaitingList } from './types';

/** One paid entry that is no longer running, waiting for a person to decide its refund. */
export interface RefundToDecideRow<T extends ShowDayReconciliationEntry> {
  entry: T;
  removal: EntryRemovalKind;
}

/**
 * Pulls and removals whose fee is still paid: the "refunds to decide" on Show Desk, the Pulls
 * menu row and the Finish the show list. The predicate is `refundToDecideRemoval`, the one
 * `summarizeShowDayReconciliation` (and so Finish the show) counts with, so the counts cannot
 * differ. Money is never refunded here; a person decides each row.
 */
export function findRefundsToDecide<T extends ShowDayReconciliationEntry>(
  entries: readonly T[]
): WaitingList<RefundToDecideRow<T>> {
  const rows: RefundToDecideRow<T>[] = [];
  for (const entry of entries) {
    const removal = refundToDecideRemoval(entry);
    if (removal) rows.push({ entry, removal });
  }
  return { count: rows.length, rows };
}
