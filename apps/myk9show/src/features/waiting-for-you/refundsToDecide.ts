import {
  classifyEntryRemoval,
  isExhibitorRemoval,
  refundDecisionUnknownRemoval,
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

/**
 * The refunds to decide, plus how many removals could not be judged because the saved decisions
 * were not read. While `decisionsUnknown` is above zero, `count` is not the whole answer, so a
 * screen must say the decisions did not load rather than show `count` as fact (MYK9-2099).
 */
export interface RefundsToDecideList<T> extends WaitingList<RefundToDecideRow<T>> {
  decisionsUnknown: number;
}

/** The Entries page's camelCase entry, read as the refund question's database fields. */
export function entryRefundInput(entry: EntryManagementEntry): RefundToDecideInput {
  return {
    entry_status: entry.rawEntryStatus,
    // MYK9-2145: one entry row per class here, so its check-in flag is the class row's.
    check_in_status: entry.classes[0]?.checkInStatus ?? null,
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
    refund_decision_unknown: entry.refundDecisionUnknown,
  };
}

function collect<T>(
  entries: readonly T[],
  read: (entry: T) => RefundToDecideInput
): RefundsToDecideList<T> {
  const rows: RefundToDecideRow<T>[] = [];
  let decisionsUnknown = 0;
  for (const entry of entries) {
    const input = read(entry);
    const removal = refundToDecideRemoval(input);
    if (removal) rows.push({ entry, removal });
    else if (refundDecisionUnknownRemoval(input)) decisionsUnknown += 1;
  }
  return { count: rows.length, rows, decisionsUnknown };
}

/**
 * Removals with a refund still to decide: the Show Desk pill, the Pulls menu row and the Finish
 * the show list. The predicate is `refundToDecideRemoval`, the one `summarizeShowDayReconciliation`
 * (and so Finish the show) counts with, so the counts cannot differ. Money is never refunded here;
 * a person decides each row.
 */
export function findRefundsToDecide<T extends RefundToDecideInput>(
  entries: readonly T[]
): RefundsToDecideList<T> {
  return collect(entries, entry => entry);
}

/** `findRefundsToDecide` over the Entries page's entries (the Pulls menu count and the pill). */
export function findEntryRefundsToDecide(
  entries: readonly EntryManagementEntry[]
): RefundsToDecideList<EntryManagementEntry> {
  return collect(entries, entryRefundInput);
}

/**
 * A row of the Entries "Pulls" list (MYK9-2099): every pull and withdrawal an exhibitor left,
 * decided or not, and every other removal (a secretary removal, a no-show) while its refund is
 * still to decide, or its saved decision could not be read. So every row
 * `findEntryRefundsToDecide` counts is on the list, and so is every row it could not judge.
 */
export function isPullsListEntry(entry: EntryManagementEntry): boolean {
  const input = entryRefundInput(entry);
  const kind = classifyEntryRemoval({
    entryStatus: input.entry_status,
    checkInStatus: input.check_in_status,
    withdrawalReasonCode: input.withdrawal_reason_code,
  });
  return (
    isExhibitorRemoval(kind) ||
    refundToDecideRemoval(input) !== null ||
    refundDecisionUnknownRemoval(input) !== null
  );
}
