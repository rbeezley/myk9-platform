import { currentCalendarDate, utcCalendarDate } from '@/features/_shared/isDayOfShowEntry';
import { resolvePaymentChannel } from '@/features/payments/paymentChannel';
import { PaymentStatus } from '@/types/show-registration-types';

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
  /**
   * `entries.payment_received_on` (a Postgres `date`): the day the desk
   * received the money, stamped in the show's zone by Entry Management's Mark
   * paid and by the desk late-entry path.
   */
  payment_received_on?: string | null;
  /**
   * The enrollment Entry Management records payments on. Its status names the
   * channel the secretary chose (Mark paid Cash / Check / Online), which the
   * entry's own `payment_method` (set when the entry was keyed) does not
   * follow, and its `paid_amount` is the only record of a partial payment.
   */
  registration?: {
    id: string;
    payment_status: string | null;
    paid_amount: number | null;
  } | null;
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
  /** `shows.end_date`, same shape. Missing means a one-day show. */
  showEndDate: string | null | undefined;
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

type DeskChannel = ReconciliationPaymentMethod | 'online';

/**
 * How this entry's money arrived. The enrollment status Mark paid wrote wins
 * over the method the entry was keyed with (a mail-in keyed as a check and
 * then marked Paid in Full: Online is not desk money), except for an entry the
 * secretary waived on its own.
 */
function deskChannel(entry: ShowDayReconciliationEntry): DeskChannel {
  const waivedOnEntry =
    entry.payment_status?.toLowerCase() === 'waived' ||
    entry.payment_method?.toLowerCase() === 'waived';
  if (!waivedOnEntry) {
    const enrollmentStatus = entry.registration?.payment_status?.toLowerCase();
    if (enrollmentStatus === PaymentStatus.PAID_ONLINE) return 'online';
    if (enrollmentStatus === PaymentStatus.PAID_BY_CASH) return 'cash';
    if (enrollmentStatus === PaymentStatus.PAID_BY_CHECK) return 'check';
  }
  const channel = resolvePaymentChannel({
    paymentMethod: entry.payment_method,
    paymentStatus: entry.payment_status,
  });
  return channel === 'online' ? 'online' : normalizeMethod(entry);
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

/** A Postgres `date` (or anything that starts with one) as `YYYY-MM-DD`. */
function calendarDateOf(value: string | null | undefined): string | undefined {
  const day = value?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

/**
 * The show-zone calendar day the desk received this entry's money.
 *
 * `payment_received_on` when the row has one: Mark paid and the desk
 * late-entry path stamp it in the show's zone, so it is already a show
 * calendar day. Otherwise the day the entry was submitted, which for a row
 * nothing stamped is the best evidence of when the money changed hands.
 */
function paymentReceivedDay(
  entry: ShowDayReconciliationEntry,
  timeZone: string | null | undefined
): string | undefined {
  const receivedOn = calendarDateOf(entry.payment_received_on);
  if (receivedOn) return receivedOn;
  const takenAt = entry.submitted_at ?? entry.created_at;
  if (!takenAt) return undefined;
  const instant = new Date(takenAt);
  if (Number.isNaN(instant.getTime())) return undefined;
  return currentCalendarDate(instant, timeZone);
}

/**
 * MYK9-677: desk money = a non-online payment RECEIVED between the show's
 * first and last day inclusive, in the show's own calendar.
 *
 * Not `is_day_of_show`. That column is the registry bucket (pre-entry vs
 * day-of-show, MYK9-642), and a mail-in keyed after entries close is a
 * day-of-show entry to UKC while its check was banked long before anyone opened
 * a cash box. Not the submission time either: a mail-in keyed weeks early and
 * paid at the desk IS in the box. The card reconciles the box, so it asks when
 * the money arrived. An online (Stripe) payment never reaches the box.
 */
function isReceivedDuringShow(
  entry: ShowDayReconciliationEntry,
  window: DeskCollectionWindow | null
): boolean {
  const startDay = utcCalendarDate(window?.showStartDate);
  if (!startDay) return false;
  const endDay = utcCalendarDate(window?.showEndDate) ?? startDay;
  const receivedDay = paymentReceivedDay(entry, window?.timeZone);
  if (!receivedDay) return false;
  return receivedDay >= startDay && receivedDay <= endDay;
}

/**
 * A partial amount on account (Entry Management's Partial Payment leaves the
 * enrollment and its entries pending with `paid_amount` recorded), counted the
 * first time one of the enrollment's in-window entries is seen.
 */
function partialPaymentOnce(entry: ShowDayReconciliationEntry, counted: Set<string>): number {
  const registration = entry.registration;
  if (!registration || counted.has(registration.id)) return 0;
  if (registration.payment_status?.toLowerCase() !== PaymentStatus.PENDING) return 0;
  const paid = amount(registration.paid_amount);
  if (paid <= 0) return 0;
  counted.add(registration.id);
  return paid;
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

  // A partial payment is recorded once on the enrollment, not per entry.
  const countedPartials = new Set<string>();

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

    // Only money RECEIVED while the show was running is desk money (MYK9-677).
    const method = deskChannel(entry);
    if (method === 'online' || !isReceivedDuringShow(entry, deskWindow)) continue;

    summary.lateEntryCount += 1;
    summary.byMethod[method].count += 1;
    summary.byMethod[method].amount += fee;

    if (method === 'waived') {
      summary.waivedCount += 1;
    } else if (paymentStatus === 'paid') {
      summary.collectedAmount += fee;
    } else {
      summary.collectedAmount += partialPaymentOnce(entry, countedPartials);
    }
  }

  return summary;
}
