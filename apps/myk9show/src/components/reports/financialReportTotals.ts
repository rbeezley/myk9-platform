import { PaymentStatus } from '@/types/show-registration-types';
import {
  financialReportPaymentLabel,
  resolvePaymentChannel,
} from '@/features/payments/paymentChannel';
import { mapPaymentStatus } from '@/utils/entryManagementUtils';
import { resolveEffectivePaymentStatus } from '@/utils/effectivePaymentStatus';
import type { ReportEntry } from '@/lib/reports/types';

export type FinancialReportMode = 'current' | 'waitlist';

export interface FinancialReportLine {
  entry: ReportEntry;
  gross: number;
  discount: number;
  netFee: number;
  collected: number;
  refunded: number;
  outstanding: number;
  waived: number;
  netRetained: number;
  paymentLabel: string;
}

export interface FinancialReportBucket {
  label: string;
  count: number;
  gross: number;
  discount: number;
  waived: number;
  collected: number;
  refunded: number;
  outstanding: number;
  netRetained: number;
}

export interface FinancialReportTotals {
  lines: FinancialReportLine[];
  summary: FinancialReportBucket;
  paymentBreakdown: FinancialReportBucket[];
  trialBreakdown: FinancialReportBucket[];
}

const WAITLIST_STATUSES = new Set(['waitlist', 'waitlisted']);
/**
 * `moved` is the SUPERSEDED half of a move-up (MYK9-639). The destination entry
 * created alongside it now carries the money -- the same payment status, fee and
 * method the exhibitor actually paid -- so counting the source as well reported
 * one paid run as two entries, and (while the destination was written as
 * `payment_status = 'waived'`) invented a "Waived/Comped" line for a comp nobody
 * granted. Excluding it nets the pair to ONE entry at the amount paid, which is
 * what `Total Entries` on the registry report has always counted.
 */
const EXCLUDED_CURRENT_STATUSES = new Set([
  'waitlist',
  'waitlisted',
  'withdrawn',
  'scratched',
  'moved',
  'not_accepted',
  'rejected',
  'missing_info',
]);

function readMoney(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Which of the two recorded statuses this line's money follows.
 *
 * The precedence is NOT this module's to decide — it is the one shared rule in
 * `@/utils/effectivePaymentStatus`, so the report can never disagree with the
 * secretary's attention list or the exhibitor's balance about whether an entry
 * is settled (MYK9-495).
 *
 * What stays local is the VOCABULARY. The report works in raw database strings,
 * and the shared rule works in the `PaymentStatus` enum, so the mapped values
 * are used only to pick a SIDE — the raw string of the winning side is what
 * travels on. Returning the mapped enum instead would turn a bare `'paid'` into
 * `paid_online` and hand `resolvePaymentChannel` an online channel nobody
 * recorded, which is exactly the F18 claim `getFinancialPaymentLabel` exists to
 * avoid.
 */
function getEffectivePaymentStatus(entry: ReportEntry): string {
  const entryStatus = normalize(entry.paymentStatus);
  const enrollmentStatus = normalize(entry.enrollmentPaymentStatus);

  if (!entryStatus) return enrollmentStatus;
  if (!enrollmentStatus) return entryStatus;

  const mappedEntryStatus = mapPaymentStatus(entryStatus);
  const resolved = resolveEffectivePaymentStatus(
    mappedEntryStatus,
    mapPaymentStatus(enrollmentStatus)
  );

  // Ties (both sides mapping to the same enum member) keep the entry's raw
  // spelling, which is what this function returned before the rule was shared.
  return resolved === mappedEntryStatus ? entryStatus : enrollmentStatus;
}

/**
 * The vacated source half of a move-up (MYK9-639).
 *
 * `moveUpShowMapEntry` leaves it at `entry_status = 'moved'` and creates a
 * destination carrying the SAME payment status, fee and method — one paid run,
 * recorded in a different class. Every surface that SUMS money over entries has
 * to drop it, or one run is charged twice; `EXCLUDED_CURRENT_STATUSES` above
 * applies the same rule to the printable report.
 *
 * Exported so the Entry Management counters, the enrollment grouping and the
 * secretary financial summary apply this one rule rather than each re-deriving
 * it — which is how the Financial Report and the registry report ended up
 * disagreeing in the first place.
 */
export function isSupersededMoveUpEntry(entry: { entryStatus?: string | null }): boolean {
  return normalize(entry.entryStatus) === 'moved';
}

export function isEntryIncludedInFinancialReport(
  entry: Pick<ReportEntry, 'entryStatus'>,
  mode: FinancialReportMode
): boolean {
  const entryStatus = normalize(entry.entryStatus);

  if (mode === 'waitlist') {
    return WAITLIST_STATUSES.has(entryStatus);
  }

  return !EXCLUDED_CURRENT_STATUSES.has(entryStatus);
}

function isWaived(entry: ReportEntry): boolean {
  return Boolean(entry.comped) || getEffectivePaymentStatus(entry) === PaymentStatus.WAIVED;
}

function isPending(entry: ReportEntry): boolean {
  return getEffectivePaymentStatus(entry) === PaymentStatus.PENDING;
}

function isFullyRefunded(entry: ReportEntry): boolean {
  return getEffectivePaymentStatus(entry) === PaymentStatus.REFUNDED;
}

function isPartiallyRefunded(entry: ReportEntry): boolean {
  return getEffectivePaymentStatus(entry) === PaymentStatus.PARTIAL_REFUND;
}

function isPaid(entry: ReportEntry): boolean {
  const status = getEffectivePaymentStatus(entry);
  return (
    status === 'paid' ||
    status === PaymentStatus.PAID_ONLINE ||
    status === PaymentStatus.PAID_BY_CHECK ||
    status === PaymentStatus.PAID_BY_CASH ||
    isFullyRefunded(entry) ||
    isPartiallyRefunded(entry)
  );
}

export function getFinancialPaymentLabel(entry: ReportEntry): string {
  if (isWaived(entry)) return 'Waived/Comped';
  if (isPending(entry)) return 'Pending';
  if (isFullyRefunded(entry)) return 'Refunded';
  if (isPartiallyRefunded(entry)) return 'Partial Refund';

  // Method-first precedence was already right here; the shared resolver keeps it and
  // fixes the tail. `status === 'paid'` used to fall through to "Online", which on
  // staging describes 1,228 rows that record no method at all -- exactly the claim a
  // secretary reconciling against a Stripe payout must not be given (F18).
  return financialReportPaymentLabel(
    resolvePaymentChannel({
      paymentMethod: entry.paymentMethod,
      paymentStatus: getEffectivePaymentStatus(entry),
    })
  );
}

/**
 * Shared outstanding-balance rule: a line's net fee is owed only while it is
 * pending and not waived/comped. Extracted so any surface reconciling
 * against the Financial Report (e.g. the Entry Management stat card) applies
 * the exact same rule instead of re-deriving it.
 */
export function computeOutstandingAmount(
  netFee: number,
  options: { isWaived: boolean; isPending: boolean }
): number {
  return !options.isWaived && options.isPending ? netFee : 0;
}

export function buildFinancialReportLine(entry: ReportEntry): FinancialReportLine {
  const gross = readMoney(entry.entryFee);
  const discount = Math.min(readMoney(entry.discountAmount), gross);
  const netFee = Math.max(0, gross - discount);
  const explicitRefund = readMoney(entry.refundAmount);
  const refunded =
    explicitRefund > 0 ? Math.min(explicitRefund, netFee) : isFullyRefunded(entry) ? netFee : 0;
  const entryIsWaived = isWaived(entry);
  const waived = entryIsWaived ? netFee : 0;
  const outstanding = computeOutstandingAmount(netFee, {
    isWaived: entryIsWaived,
    isPending: isPending(entry),
  });
  const collected = !waived && isPaid(entry) ? netFee : 0;
  const netRetained = collected - refunded;

  return {
    entry,
    gross,
    discount,
    netFee,
    collected,
    refunded,
    outstanding,
    waived,
    netRetained,
    paymentLabel: getFinancialPaymentLabel(entry),
  };
}

function emptyBucket(label: string): FinancialReportBucket {
  return {
    label,
    count: 0,
    gross: 0,
    discount: 0,
    waived: 0,
    collected: 0,
    refunded: 0,
    outstanding: 0,
    netRetained: 0,
  };
}

function addLine(bucket: FinancialReportBucket, line: FinancialReportLine): void {
  bucket.count += 1;
  bucket.gross += line.gross;
  bucket.discount += line.discount;
  bucket.waived += line.waived;
  bucket.collected += line.collected;
  bucket.refunded += line.refunded;
  bucket.outstanding += line.outstanding;
  bucket.netRetained += line.netRetained;
}

function getTrialLabel(entry: ReportEntry): string {
  const trial = entry.trialNumber ? `Trial ${entry.trialNumber}` : 'Unassigned trial';
  return entry.trialDate ? `${trial} (${entry.trialDate})` : trial;
}

function sortBuckets(a: FinancialReportBucket, b: FinancialReportBucket): number {
  return a.label.localeCompare(b.label);
}

export function calculateFinancialReportTotals(
  entries: ReportEntry[],
  mode: FinancialReportMode
): FinancialReportTotals {
  const lines = entries
    .filter(entry => isEntryIncludedInFinancialReport(entry, mode))
    .map(buildFinancialReportLine);
  const summary = emptyBucket('Total');
  const paymentMap = new Map<string, FinancialReportBucket>();
  const trialMap = new Map<string, FinancialReportBucket>();

  for (const line of lines) {
    addLine(summary, line);

    const paymentBucket = paymentMap.get(line.paymentLabel) ?? emptyBucket(line.paymentLabel);
    addLine(paymentBucket, line);
    paymentMap.set(line.paymentLabel, paymentBucket);

    const trialLabel = getTrialLabel(line.entry);
    const trialBucket = trialMap.get(trialLabel) ?? emptyBucket(trialLabel);
    addLine(trialBucket, line);
    trialMap.set(trialLabel, trialBucket);
  }

  return {
    lines,
    summary,
    paymentBreakdown: [...paymentMap.values()].sort(sortBuckets),
    trialBreakdown: [...trialMap.values()].sort(sortBuckets),
  };
}
