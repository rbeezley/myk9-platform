import { currentCalendarDate, utcCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import { deskStatusEditableFor } from '@/components/entries/management/checkInDesk/deskEditable';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { mapClassEntryStatus } from '@/utils/entryManagementUtils';
import {
  classifyEntryRemoval,
  emptyEntryRemovalCounts,
  refundDecisionUnknownRemoval,
  refundToDecideRemoval,
  type EntryRemovalCounts,
} from '@/features/payments/pullReconciliation';
import {
  ledgerAmount,
  type LedgerMethod,
  type ShowPaymentLedgerRow,
} from '@/features/payments/showPaymentLedger';

/** The two ways money reaches the desk's cash box. */
export const DESK_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'check', label: 'Check' },
] as const satisfies ReadonlyArray<{ id: LedgerMethod; label: string }>;

/**
 * The entry fields the card reads. Every one is on `SecretaryEntry`, so the
 * Show Desk hands its canonical entry read straight in with no cast.
 */
export interface ShowDayReconciliationEntry {
  id?: string | null;
  /** Counts a dog flagged in two classes once in `flaggedPullDogCount`. */
  dog_id?: string | null;
  entry_fee?: number | string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  /** A scored run is finished: its flag is not one the Check-in desk can confirm. */
  is_scored?: boolean | null;
  /** 'in_season' | 'judge_change' on a withdrawal; null on a pull or a secretary removal. */
  withdrawal_reason_code?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  /** Read by `refundToDecideRemoval`: a refunded or denied removal is decided (MYK9-2099). */
  refund_amount?: number | string | null;
  /** MYK9-2303: dollars the club paid back directly after the payout. */
  club_refunded_amount?: number | string | null;
  refunded_at?: string | null;
  refund_decision?: string | null;
  /** The saved refund decisions could not be read (MYK9-2099). */
  refund_decision_unknown?: boolean;
  submitted_at?: string | null;
  created_at?: string | null;
}

/**
 * When the show was running. `null` when the caller has no show dates (the
 * close-out readiness gate reads only the pull/refund figures); nothing then
 * counts as taken during the show.
 */
export interface DeskCollectionWindow {
  /** `shows.start_date`: timestamptz at midnight UTC, or a bare `YYYY-MM-DD`. */
  showStartDate: string | null | undefined;
  /** `shows.end_date`, same shape. Missing means a one-day show. */
  showEndDate: string | null | undefined;
  /** IANA zone of the show's first trial; the calendar the desk works in. */
  timeZone: string | null | undefined;
}

/**
 * MYK9-677. Two independent questions, deliberately not joined:
 *
 * - PAYMENTS received during the show come from the payments ledger, one row
 *   per payment. An enrollment's payment is not attributed to its entries:
 *   one payment can cover an old entry and a new one, or finish online what
 *   the desk started, so no entry count can honestly follow it.
 * - ENTRIES MADE DURING THE SHOW: entries submitted on a show day, on the
 *   show's calendar, whatever they were paid with (or not yet). Context for
 *   the payments figure, not a reconciliation: the entry row does not record
 *   who entered it, so this includes an exhibitor's own show-day entry when
 *   entries close during the show (owner decision, Codex round 8).
 */
export interface ShowDayReconciliationSummary {
  totalEntryCount: number;
  /** Entries made during the show: submitted on a show day, show calendar. */
  entriesDuringShowCount: number;
  /** Of those, the ones the secretary waived. */
  waivedDuringShowCount: number;
  /** Cash and check payments received during the show, net of refunds and resets. */
  paymentCount: number;
  paymentAmount: number;
  byMethod: Record<LedgerMethod, { count: number; amount: number }>;
  /** Every entry no longer running, by true category (MYK9-987). */
  removals: EntryRemovalCounts;
  /** Sum of `removals`: the closeout review gate. */
  removalCount: number;
  /**
   * MYK9-2145: dogs with a check-in "pulled" flag (Ringside's Pull, the exhibitor's own check-in
   * pull) that the secretary has not confirmed at the Check-in desk, counting only the flags the
   * desk offers Confirm on (`isDeskConfirmableFlag`). A flag is not a removal and
   * owes no refund decision until confirmed (docs/INTENT.md, Withdraw vs Pull), so these are
   * counted apart from `removals`.
   */
  flaggedPullDogCount: number;
  /** Of those, the ones whose fee is marked refunded, by category. */
  refundedRemovals: EntryRemovalCounts;
  refundReviewCount: number;
  refundReviewAmount: number;
  /** Of those, the paid ones awaiting a refund decision, by category. */
  refundReviewRemovals: EntryRemovalCounts;
  /**
   * Paid removals whose saved refund decision could not be read (MYK9-2099). Above zero, the
   * refund review figures are not the whole answer and must not be shown as fact.
   */
  refundDecisionUnknownCount: number;
  refundedCount: number;
  refundedAmount: number;
  /**
   * MYK9-2303: dollars the club paid back directly after the payout, summed over every entry.
   * Outside the cash-box reconciliation and apart from `refundedAmount` (a Stripe refund).
   */
  clubRefundedAmount: number;
}

function amount(value: ShowDayReconciliationEntry['entry_fee']): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function isWaived(entry: ShowDayReconciliationEntry): boolean {
  return (
    entry.payment_status?.toLowerCase() === 'waived' ||
    entry.payment_method?.toLowerCase() === 'waived'
  );
}

/** A Postgres `date` (or anything that starts with one) as `YYYY-MM-DD`. */
function calendarDateOf(value: string | null | undefined): string | undefined {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

/** The show's first and last day, or null when nothing can be during the show. */
function windowDays(window: DeskCollectionWindow | null): { start: string; end: string } | null {
  const start = utcCalendarDate(window?.showStartDate);
  if (!start) return null;
  return { start, end: utcCalendarDate(window?.showEndDate) ?? start };
}

/**
 * An entry made during the show: submitted on one of the show's days, on the
 * show's own calendar.
 *
 * Not `is_day_of_show`: that is the registry bucket (MYK9-642), and a mail-in
 * keyed after entries close but weeks before the show is day-of-show to the
 * registry. Who entered it is not recorded on the row, so this does not claim
 * the desk took it.
 */
function isEntryMadeDuringShow(
  entry: ShowDayReconciliationEntry,
  days: { start: string; end: string } | null,
  timeZone: string | null | undefined
): boolean {
  if (!days) return false;
  const takenAt = entry.submitted_at ?? entry.created_at;
  if (!takenAt) return false;
  const instant = new Date(takenAt);
  if (Number.isNaN(instant.getTime())) return false;
  const day = currentCalendarDate(instant, timeZone);
  return day >= days.start && day <= days.end;
}

/**
 * Payments received during the show. Dollars are every in-window row summed,
 * refunds and resets included. Counts are netted first, per parent (enrollment
 * or desk entry) and method: a parent whose rows net to $0 or less holds no
 * money in the box (a "Payment Due" reset, a payment handed back in full) and
 * adds no payment; one that still holds money counts each of its payments.
 */
function applyLedger(
  summary: ShowDayReconciliationSummary,
  payments: readonly ShowPaymentLedgerRow[],
  days: { start: string; end: string } | null
): void {
  if (!days) return;
  const groups = new Map<string, { method: LedgerMethod; net: number; payments: number }>();
  for (const row of payments) {
    const day = calendarDateOf(row.received_on);
    if (!day || day < days.start || day > days.end) continue;
    const value = ledgerAmount(row);
    summary.byMethod[row.method].amount += value;
    summary.paymentAmount += value;
    const key = `${row.enrollment_id ?? `entry:${row.entry_id}`}|${row.method}`;
    const group = groups.get(key) ?? { method: row.method, net: 0, payments: 0 };
    group.net += value;
    if (row.kind === 'payment') group.payments += 1;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    // Cents, so float noise cannot keep a reset parent alive.
    if (Math.round(group.net * 100) <= 0) continue;
    summary.byMethod[group.method].count += group.payments;
    summary.paymentCount += group.payments;
  }
}

/**
 * MYK9-2145: a check-in "pulled" flag the Check-in desk would offer to confirm, by the desk's own
 * rule (`deskStatusEditableFor`, mapped as the Show Desk class table maps a raw entry). A flag on
 * a scored, pending, waitlisted, rejected, cancelled or already-removed entry is not listed: it
 * is neither a pull nor something the secretary can act on there.
 */
function isDeskConfirmableFlag(entry: ShowDayReconciliationEntry): boolean {
  if (entry.check_in_status?.toLowerCase() !== 'pulled') return false;
  return deskStatusEditableFor({
    entryStatus: mapEntryStatus(entry.entry_status),
    classStatus: mapClassEntryStatus(entry.entry_status),
    checkInStatus: 'pulled',
    isScored: entry.is_scored,
  });
}

export function summarizeShowDayReconciliation(
  entries: ShowDayReconciliationEntry[],
  deskWindow: DeskCollectionWindow | null,
  payments: readonly ShowPaymentLedgerRow[] = []
): ShowDayReconciliationSummary {
  const summary: ShowDayReconciliationSummary = {
    totalEntryCount: 0,
    entriesDuringShowCount: 0,
    waivedDuringShowCount: 0,
    paymentCount: 0,
    paymentAmount: 0,
    byMethod: { cash: { count: 0, amount: 0 }, check: { count: 0, amount: 0 } },
    removals: emptyEntryRemovalCounts(),
    removalCount: 0,
    flaggedPullDogCount: 0,
    refundedRemovals: emptyEntryRemovalCounts(),
    refundReviewCount: 0,
    refundReviewAmount: 0,
    refundReviewRemovals: emptyEntryRemovalCounts(),
    refundDecisionUnknownCount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    clubRefundedAmount: 0,
  };
  const days = windowDays(deskWindow);

  applyLedger(summary, payments, days);
  const flaggedDogs = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    const fee = amount(entry.entry_fee);
    const paymentStatus = entry.payment_status?.toLowerCase();
    summary.totalEntryCount += 1;
    summary.clubRefundedAmount += Math.max(0, amount(entry.club_refunded_amount));

    // MYK9-2145: the removal is read from `entry_status` alone, as refunds to decide read it, so
    // the removal total and the refund count agree. A check-in flag is counted on its own below.
    const removal = classifyEntryRemoval({
      entryStatus: entry.entry_status,
      withdrawalReasonCode: entry.withdrawal_reason_code,
    });
    if (!removal && isDeskConfirmableFlag(entry)) {
      flaggedDogs.add(entry.dog_id ?? `entry:${entry.id ?? index}`);
    }
    if (removal) {
      summary.removals[removal] += 1;
      summary.removalCount += 1;
      if (paymentStatus === 'refunded') {
        summary.refundedRemovals[removal] += 1;
        summary.refundedCount += 1;
        summary.refundedAmount += fee;
      } else if (refundToDecideRemoval(entry)) {
        summary.refundReviewRemovals[removal] += 1;
        summary.refundReviewCount += 1;
        summary.refundReviewAmount += fee;
      } else if (refundDecisionUnknownRemoval(entry)) {
        summary.refundDecisionUnknownCount += 1;
      }
    }

    if (isEntryMadeDuringShow(entry, days, deskWindow?.timeZone)) {
      summary.entriesDuringShowCount += 1;
      if (isWaived(entry)) summary.waivedDuringShowCount += 1;
    }
  }

  summary.flaggedPullDogCount = flaggedDogs.size;
  return summary;
}
