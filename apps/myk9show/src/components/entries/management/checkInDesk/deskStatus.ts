/**
 * The Check-in desk's own status rules (MYK9-1736, MYK9-1749): which statuses it sets, what it
 * calls them, and when a Pull may be put back. Split from `peopleRoster.ts`, which applies them.
 */
import { STAFF_CHECK_IN_STATUSES } from '@myk9/core';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { getStatusDescriptor } from '@/components/status';
import { isTrialDateToday } from '@/features/_shared/trialDateEligibility';

/**
 * The statuses the Check-in desk sets on one class: every staff check-in status, the same six
 * Ringside offers (owner, MYK9-1749). Pulled on the desk is the real Pull (scratched, refund
 * review) behind a confirmation (`useDeskPull`), and a pulled class can be put back the same way
 * until a refund is issued or decided. In ring and Completed belong to the judge and scoring.
 */
export const DESK_CHECK_IN_STATUSES: readonly CheckInStatus[] = STAFF_CHECK_IN_STATUSES;
export const DESK_STATUS_SET: ReadonlySet<CheckInStatus> = new Set(DESK_CHECK_IN_STATUSES);

/** The desk's words for its statuses: "No Status" reads as a fault to a secretary. */
export const DESK_STATUS_LABELS: Partial<Record<CheckInStatus, string>> = {
  'no-status': 'Not checked in',
};

export function deskStatusLabel(status: CheckInStatus): string {
  return DESK_STATUS_LABELS[status] ?? getStatusDescriptor('entry', status).label;
}

/**
 * A Pull whose money has moved: refunded in part or full, or the refund decided (MYK9-1749).
 * Such a Pull is never undone from the desk, so no refund ends up on a dog that runs.
 */
export function pullRefundSettled(entry: EntryManagementEntry): boolean {
  return (
    (entry.refundAmount ?? 0) > 0 ||
    Boolean(entry.refundedAt) ||
    Boolean(entry.refundDecision) ||
    entry.paymentStatus === PaymentStatus.REFUNDED ||
    entry.paymentStatus === PaymentStatus.PARTIAL_REFUND
  );
}

/**
 * A real Pull the desk may undo today (owner, MYK9-1749): pulled and scratched, the trial is
 * today, the run unscored, and no refund issued or decided.
 */
export function deskUnpullState(
  entry: EntryManagementEntry,
  cls: EntryClass,
  info: { trialDate?: string; timezone?: string | null } | undefined,
  currentDate: Date | null | undefined
): { canUnpull: boolean; settled: boolean } {
  const realPull =
    (cls.checkInStatus ?? 'no-status') === 'pulled' && entry.entryStatus === EntryStatus.SCRATCHED;
  if (!realPull || entry.isScored) return { canUnpull: false, settled: false };
  const today =
    !currentDate ||
    (Boolean(info?.trialDate) && isTrialDateToday(info!.trialDate!, info!.timezone, currentDate));
  const settled = pullRefundSettled(entry);
  return { canUnpull: today && !settled, settled };
}
