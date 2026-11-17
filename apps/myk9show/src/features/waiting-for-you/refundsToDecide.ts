import {
  classifyEntryRemoval,
  isExhibitorRemoval,
  refundToDecideRemoval,
  type EntryRemovalKind,
  type RefundToDecideInput,
} from '@/features/payments/pullReconciliation';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PaymentStatus } from '@/types/show-registration-types';
import type { WaitingList } from './types';

/** One paid entry that is no longer running, waiting for a person to decide its refund. */
export interface RefundToDecideRow<T> {
  entry: T;
  removal: EntryRemovalKind;
}

/** The Entries page's camelCase entry, read as the refund question's database fields. */
export function entryRefundInput(entry: EntryManagementEntry): RefundToDecideInput {
  return {
    entry_status: entry.rawEntryStatus,
    withdrawal_reason_code: entry.withdrawalReasonCode,
    // The raw column; a row built without it falls back to the UI enum, whose paid-online is 'paid'.
    payment_status:
      entry.rawPaymentStatus !== undefined
        ? entry.rawPaymentStatus
        : entry.paymentStatus === PaymentStatus.PAID_ONLINE
          ? 'paid'
          : entry.paymentStatus,
    payment_method: entry.paymentMethod,
    refund_amount: entry.refundAmount,
    refunded_at: entry.refundedAt,
    refund_decision: entry.refundDecision,
  };
}

function collect<T>(
  entries: readonly T[],
  read: (entry: T) => RefundToDecideInput
): WaitingList<RefundToDecideRow<T>> {
  const rows: RefundToDecideRow<T>[] = [];
  for (const entry of entries) {
    const removal = refundToDecideRemoval(read(entry));
    if (removal) rows.push({ entry, removal });
  }
  return { count: rows.length, rows };
}

/**
 * Removals with a refund still to decide: the Show Desk pill, the Pulls menu row and the Finish
 * the show list. The predicate is `refundToDecideRemoval`, the one `summarizeShowDayReconciliation`
 * (and so Finish the show) counts with, so the counts cannot differ. Money is never refunded here;
 * a person decides each row.
 */
export function findRefundsToDecide<T extends RefundToDecideInput>(
  entries: readonly T[]
): WaitingList<RefundToDecideRow<T>> {
  return collect(entries, entry => entry);
}

/** `findRefundsToDecide` over the Entries page's entries (the Pulls menu count and the pill). */
export function findEntryRefundsToDecide(
  entries: readonly EntryManagementEntry[]
): WaitingList<RefundToDecideRow<EntryManagementEntry>> {
  return collect(entries, entryRefundInput);
}

/**
 * A row of the Entries "Pulls" list (MYK9-2099): every pull and withdrawal an exhibitor left,
 * decided or not, and every other removal (a secretary removal, a no-show) while its refund is
 * still to decide. So every row `findEntryRefundsToDecide` counts is on the list.
 */
export function isPullsListEntry(entry: EntryManagementEntry): boolean {
  const input = entryRefundInput(entry);
  const kind = classifyEntryRemoval({
    entryStatus: input.entry_status,
    withdrawalReasonCode: input.withdrawal_reason_code,
  });
  return isExhibitorRemoval(kind) || refundToDecideRemoval(input) !== null;
}
