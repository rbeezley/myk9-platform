import { formatTrialLabel } from '@myk9/core';
import { PaymentStatus } from '@/types/show-registration-types';
import {
  financialReportPaymentLabel,
  resolvePaymentChannel,
} from '@/features/payments/paymentChannel';
import { mapPaymentStatus } from '@/utils/entryManagementUtils';
import { resolveEffectivePaymentStatus } from '@/utils/effectivePaymentStatus';
import {
  buildMoneyAttribution,
  isSupersededMoveUpEntry,
  type MoneyRootProblem,
} from '@/features/financial/moneyRoot';
import type { ReportEntry } from '@/lib/reports/types';

export { isSupersededMoveUpEntry };

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
  /**
   * Entries whose money row could not be reached — a move-up whose source sits
   * outside this report's scope, or a broken chain. NEVER silently $0: a
   * non-empty list means the figures above are incomplete and the report says
   * so. See `resolveMoneyRoot`.
   */
  unresolvedMoneyRoots: Array<{ entryId: string; problem: MoneyRootProblem }>;
}

/**
 * `moved` is the SUPERSEDED half of a move-up (MYK9-639): the dog runs once, in
 * the destination class. The destination holds no money of its own —
 * `buildMoneyAttribution` reads its dollars back off this row — so the source is
 * excluded from the COUNT while its settlement still reaches the report through
 * the live descendant. That is what makes `entries` here agree with
 * `Total Entries` on the registry reports.
 */
// Two vocabularies reach this set: raw `entries.entry_status` strings from the
// report rows, and the UI `EntryStatus` enum from Entry Management's outstanding
// stat (`getEntryManagementCountSummary`). `waitlist`, `missing_info` and
// `not_accepted` are enum values; `waitlisted` and `rejected` are legacy raw
// spellings. None of the waitlist values is a status an `entries` row can hold.
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
 * MYK9-718: there is no "waitlisted entries" mode. A waitlisted dog is a
 * `waitlist_entries` row, never an `entries` row (the status CHECK has no
 * waitlist value), and it carries no money, so a waitlist variant of this
 * report could only ever print empty. The Waitlist Report lists who is waiting.
 */
export function isEntryIncludedInFinancialReport(entry: Pick<ReportEntry, 'entryStatus'>): boolean {
  return !EXCLUDED_CURRENT_STATUSES.has(normalize(entry.entryStatus));
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

/**
 * Project one line.
 *
 * `entry` is the run — its class, its trial, its dog. `moneyRoot` is where that
 * run's money is recorded, which after MYK9-639 is a DIFFERENT row whenever the
 * dog was moved up: the destination is created money-neutral and
 * `moved_from_entry_id` points back at the entry the exhibitor paid for. The
 * two arguments are the whole fix — one row per run, dollars read once, from
 * wherever they actually live. Defaults to the entry itself, which is the
 * answer for every entry that was never moved.
 */
export function buildFinancialReportLine(
  entry: ReportEntry,
  moneyRoot: ReportEntry = entry
): FinancialReportLine {
  const gross = readMoney(moneyRoot.entryFee);
  const discount = Math.min(readMoney(moneyRoot.discountAmount), gross);
  const netFee = Math.max(0, gross - discount);
  const explicitRefund = readMoney(moneyRoot.refundAmount);
  const refunded =
    explicitRefund > 0 ? Math.min(explicitRefund, netFee) : isFullyRefunded(moneyRoot) ? netFee : 0;
  const entryIsWaived = isWaived(moneyRoot);
  const waived = entryIsWaived ? netFee : 0;
  const outstanding = computeOutstandingAmount(netFee, {
    isWaived: entryIsWaived,
    isPending: isPending(moneyRoot),
  });
  const collected = !waived && isPaid(moneyRoot) ? netFee : 0;
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
    paymentLabel: getFinancialPaymentLabel(moneyRoot),
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
  const trial =
    entry.trialName || entry.trialNumber
      ? formatTrialLabel({ name: entry.trialName, trialNumber: entry.trialNumber })
      : 'Unassigned trial';
  return entry.trialDate ? `${trial} (${entry.trialDate})` : trial;
}

function sortBuckets(a: FinancialReportBucket, b: FinancialReportBucket): number {
  return a.label.localeCompare(b.label);
}

export function calculateFinancialReportTotals(entries: ReportEntry[]): FinancialReportTotals {
  // Attribution first, over EVERY entry in scope — including the `moved` rows,
  // which are not counted but ARE where the money of a moved-up dog is read
  // from. Filtering before this would throw away the roots.
  const attribution = buildMoneyAttribution(entries);
  const lines = attribution.live
    .filter(entry => isEntryIncludedInFinancialReport(entry))
    .map(entry => buildFinancialReportLine(entry, attribution.rootById.get(entry.id) ?? entry));
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

  const countedIds = new Set(lines.map(line => line.entry.id));
  return {
    lines,
    summary,
    paymentBreakdown: [...paymentMap.values()].sort(sortBuckets),
    trialBreakdown: [...trialMap.values()].sort(sortBuckets),
    unresolvedMoneyRoots: attribution.unresolved
      .filter(item => item.problem === 'orphaned-supersession' || countedIds.has(item.entryId))
      .map(({ entryId, problem }) => ({ entryId, problem })),
  };
}
