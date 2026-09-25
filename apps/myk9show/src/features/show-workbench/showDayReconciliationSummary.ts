import { currentCalendarDate, utcCalendarDate } from '@/features/_shared/isDayOfShowEntry';
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
  entry_fee?: number | string | null;
  entry_status?: string | null;
  check_in_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
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
 * - LATE ENTRIES are entries keyed during the show, by their own submission
 *   time, whatever they were paid with (or not yet).
 */
export interface ShowDayReconciliationSummary {
  totalEntryCount: number;
  /** Entries submitted during the show's days, on the show's calendar. */
  lateEntryCount: number;
  /** Of those, the ones the secretary waived. */
  waivedLateEntryCount: number;
  /** Cash and check payments received during the show, net of refunds and resets. */
  paymentCount: number;
  paymentAmount: number;
  byMethod: Record<LedgerMethod, { count: number; amount: number }>;
  pulledCount: number;
  refundReviewCount: number;
  refundReviewAmount: number;
  refundedCount: number;
  refundedAmount: number;
}

function amount(value: ShowDayReconciliationEntry['entry_fee']): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function isPulledEntry(entry: ShowDayReconciliationEntry): boolean {
  const entryStatus = entry.entry_status?.toLowerCase();
  const checkInStatus = entry.check_in_status?.toLowerCase();
  return (
    checkInStatus === 'pulled' ||
    entryStatus === 'scratched' ||
    entryStatus === 'withdrawn' ||
    entryStatus === 'absent'
  );
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
 * A late entry: submitted during the show, on the show's own calendar.
 *
 * Not `is_day_of_show`: that is the registry bucket (MYK9-642), and a mail-in
 * keyed after entries close but weeks before the show is day-of-show to the
 * registry while nobody at the desk took it. Submission time is when the
 * secretary keyed it; entries close before the show for exhibitors, so an
 * entry keyed during the show was keyed by staff.
 */
function isLateEntry(
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

export function summarizeShowDayReconciliation(
  entries: ShowDayReconciliationEntry[],
  deskWindow: DeskCollectionWindow | null,
  payments: readonly ShowPaymentLedgerRow[] = []
): ShowDayReconciliationSummary {
  const summary: ShowDayReconciliationSummary = {
    totalEntryCount: 0,
    lateEntryCount: 0,
    waivedLateEntryCount: 0,
    paymentCount: 0,
    paymentAmount: 0,
    byMethod: { cash: { count: 0, amount: 0 }, check: { count: 0, amount: 0 } },
    pulledCount: 0,
    refundReviewCount: 0,
    refundReviewAmount: 0,
    refundedCount: 0,
    refundedAmount: 0,
  };
  const days = windowDays(deskWindow);

  applyLedger(summary, payments, days);

  for (const entry of entries) {
    const fee = amount(entry.entry_fee);
    const paymentStatus = entry.payment_status?.toLowerCase();
    summary.totalEntryCount += 1;

    if (isPulledEntry(entry)) {
      summary.pulledCount += 1;
      if (paymentStatus === 'refunded') {
        summary.refundedCount += 1;
        summary.refundedAmount += fee;
      } else if (paymentStatus === 'paid') {
        summary.refundReviewCount += 1;
        summary.refundReviewAmount += fee;
      }
    }

    if (isLateEntry(entry, days, deskWindow?.timeZone)) {
      summary.lateEntryCount += 1;
      if (isWaived(entry)) summary.waivedLateEntryCount += 1;
    }
  }

  return summary;
}
