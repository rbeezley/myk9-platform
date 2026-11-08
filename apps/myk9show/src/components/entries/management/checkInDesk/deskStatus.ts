/**
 * The Check-in desk's own status rules (MYK9-1736, MYK9-1749): which statuses it sets, what it
 * calls them, and when a Pull may be put back. Split from `peopleRoster.ts`, which applies them.
 */
import { STAFF_CHECK_IN_STATUSES } from '@myk9/core';
import type { CheckInStatus } from '@/types/check-in-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { getStatusDescriptor } from '@/components/status';
import { formatTrialDayLabel, isTrialDateToday } from '@/features/_shared/trialDateEligibility';

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
  const refunded = (status: PaymentStatus | string | null | undefined) =>
    status === PaymentStatus.REFUNDED || status === PaymentStatus.PARTIAL_REFUND;
  // Entry-level (Stripe) and form-level (a mail-in refund recorded by hand) alike. A form-level
  // refund cannot always be tied to this one entry, so it counts as settled to be safe.
  return (
    (entry.refundAmount ?? 0) > 0 ||
    Boolean(entry.refundedAt) ||
    Boolean(entry.refundDecision) ||
    refunded(entry.paymentStatus) ||
    (entry.enrollmentRefundAmount ?? 0) > 0 ||
    Boolean(entry.enrollmentRefundedAt) ||
    refunded(entry.enrollmentPaymentStatus)
  );
}

/** A Pull the desk will not put back: why, and where to go instead. */
export const PULLED_REFUND_DECIDED_LABEL = 'Pulled · refund decided, see Entries';

/** The DB entry status an accepted entry stores; the only one the desk puts a Pull back to. */
export const ACCEPTED_DB_STATUS = 'confirmed';

/**
 * What the entry was just before its latest Pull, from `entry_status_history` (written by a
 * trigger on every status change). A Pull is offered on pending, waitlisted and withdrawn
 * entries too, so the desk puts back only a Pull of an accepted entry (MYK9-1749 review).
 */
export function statusBeforeLatestPull(
  history: readonly { previousStatus: string | null; newStatus: string }[]
): string | null {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]!;
    if (item.newStatus === 'scratched') return item.previousStatus;
  }
  return null;
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

/**
 * A Pulled check-in on a class that is still entered is a flag an exhibitor or ringside set, not a
 * Pull (MYK9-1749/1753): the secretary confirms it or clears it. A real Pull is not desk-editable.
 */
export function isFlaggedPull(row: {
  deskStatusEditable: boolean;
  checkInStatus: CheckInStatus;
}): boolean {
  return row.deskStatusEditable && row.checkInStatus === 'pulled';
}

/**
 * Who flagged the pull, in words (MYK9-1757). The source is server-stamped and rides the same
 * replicated row as the flag; anything else (offline, an older row, an unknown value) says only
 * that it is flagged.
 */
export function flaggedPullLabel(source: string | null | undefined): string {
  if (source === 'exhibitor') return 'The exhibitor flagged this pull.';
  if (source === 'staff') return 'Ringside staff flagged this pull.';
  return 'Flagged as pulled.';
}

/** Why a row stays locked when its badge alone does not say (a scored run, a run in the ring). */
export function deskLockedReason(
  entry: EntryManagementEntry,
  current: CheckInStatus,
  editable: boolean
): string | null {
  if (editable) return null;
  if (entry.isScored) return 'Scored, so the status is locked';
  if (current === 'in-ring') return 'In the ring, so ringside controls the status';
  return null;
}

/** The trial's day ("Sun Dec 7") when it is not today; null on today or without a clock or date. */
export function deskDayLabel(
  info: { trialDate?: string; timezone?: string | null } | undefined,
  currentDate: Date | null | undefined
): string | null {
  if (!currentDate || !info?.trialDate) return null;
  return isTrialDateToday(info.trialDate, info.timezone, currentDate)
    ? null
    : formatTrialDayLabel(info.trialDate);
}
