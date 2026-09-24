import { currentCalendarDate, utcCalendarDate } from '@/features/_shared/isDayOfShowEntry';

export const LATE_ENTRY_PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'check', label: 'Check' },
  { id: 'waived', label: 'Waived' },
  { id: 'paid', label: 'Paid' },
  { id: 'unknown', label: 'Unspecified' },
] as const;

export type ReconciliationPaymentMethod = (typeof LATE_ENTRY_PAYMENT_METHODS)[number]['id'];

/**
 * The fields the card reads. Every one is on `SecretaryEntry`, so the Show Desk
 * hands its canonical entry read straight in with no cast: a field this needs
 * that the read does not carry is a type error, not a silent zero.
 * (`is_day_of_show` was read here once, and the secretary read never carried
 * it — MYK9-677.)
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
 * When the show was running, for "was this entry taken at the desk?".
 *
 * `null` when the caller has no show dates (the close-out readiness gate reads
 * only the pull/refund figures); nothing then counts as desk-taken, because
 * nothing can be proved to be.
 */
export interface DeskCollectionWindow {
  /** `shows.start_date`: timestamptz at midnight UTC, or a bare `YYYY-MM-DD`. */
  showStartDate: string | null | undefined;
  /** IANA zone of the show's first trial; the calendar the desk works in. */
  timeZone: string | null | undefined;
}

export interface ShowDayReconciliationSummary {
  totalEntryCount: number;
  lateEntryCount: number;
  collectedAmount: number;
  waivedCount: number;
  pulledCount: number;
  refundReviewCount: number;
  refundReviewAmount: number;
  refundedCount: number;
  refundedAmount: number;
  byMethod: Record<ReconciliationPaymentMethod, { count: number; amount: number }>;
}

function emptyBreakdown(): ShowDayReconciliationSummary['byMethod'] {
  return LATE_ENTRY_PAYMENT_METHODS.reduce(
    (acc, method) => {
      acc[method.id] = { count: 0, amount: 0 };
      return acc;
    },
    {} as ShowDayReconciliationSummary['byMethod']
  );
}

function amount(value: ShowDayReconciliationEntry['entry_fee']): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : 0;
}

function normalizeMethod(entry: ShowDayReconciliationEntry): ReconciliationPaymentMethod {
  const method = entry.payment_method?.toLowerCase();
  if (method === 'cash' || method === 'check' || method === 'waived') return method;
  if (entry.payment_status === 'waived') return 'waived';
  if (entry.payment_status === 'paid') return 'paid';
  return 'unknown';
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

/**
 * MYK9-677: taken at the desk = SUBMITTED on or after the show's first day, in
 * the show's own calendar.
 *
 * Not `is_day_of_show`. That column is the registry bucket (pre-entry vs
 * day-of-show, MYK9-642), and a mail-in keyed after entries close but weeks
 * before the show is a day-of-show entry to UKC while its check was banked
 * long before anyone opened a cash box. The card reconciles the box, so it asks
 * when the entry was taken, not which registry line it is billed on.
 */
export function isTakenAtShow(
  entry: ShowDayReconciliationEntry,
  window: DeskCollectionWindow | null
): boolean {
  const startDay = utcCalendarDate(window?.showStartDate);
  if (!startDay) return false;
  const takenAt = entry.submitted_at ?? entry.created_at;
  if (!takenAt) return false;
  const instant = new Date(takenAt);
  if (Number.isNaN(instant.getTime())) return false;
  return currentCalendarDate(instant, window?.timeZone) >= startDay;
}

export function summarizeShowDayReconciliation(
  entries: ShowDayReconciliationEntry[],
  deskWindow: DeskCollectionWindow | null
): ShowDayReconciliationSummary {
  const summary: ShowDayReconciliationSummary = {
    totalEntryCount: 0,
    lateEntryCount: 0,
    collectedAmount: 0,
    waivedCount: 0,
    pulledCount: 0,
    refundReviewCount: 0,
    refundReviewAmount: 0,
    refundedCount: 0,
    refundedAmount: 0,
    byMethod: emptyBreakdown(),
  };

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

    // Only entries TAKEN while the show was running are desk money (MYK9-677).
    if (!isTakenAtShow(entry, deskWindow)) continue;

    const method = normalizeMethod(entry);
    summary.lateEntryCount += 1;
    summary.byMethod[method].count += 1;
    summary.byMethod[method].amount += fee;

    if (method === 'waived') {
      summary.waivedCount += 1;
    } else if (paymentStatus === 'paid') {
      summary.collectedAmount += fee;
    }
  }

  return summary;
}
