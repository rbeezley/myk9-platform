import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PaymentStatus } from '@/types/show-registration-types';
import { getEffectivePaymentStatus } from './entryManagementUtils';
import { buildMoneyAttribution } from '@/features/financial/moneyRoot';

export interface EnrollmentGroup {
  /** Unique per group (registrationId | pi:<intent> | entry:<id>) — the React
   * key. enrollmentId is NOT unique: every online group has null. */
  groupKey: string;
  enrollmentId: string | null;
  confirmationNumber: string | null;
  handlerName: string;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  /**
   * Unit of totalAmount. Stripe amounts are in cents on enrollments.total_amount,
   * but entries.entry_fee (summed as fallback) is in dollars.
   */
  totalAmountUnit: 'cents' | 'dollars';
  /** Amount already recorded as paid, in dollars. */
  paidAmount: number;
  paymentReference: string | null;
  /**
   * `entries.payment_method` — the only field that records HOW payment arrived.
   * The group used to drop it, so the UI had nothing but `payment_status` to go on
   * and rendered the generic 'paid' as "Paid online" (F18).
   */
  paymentMethod: string | null;
  /**
   * Raw DB `payment_status`. `paymentStatus` above has already been through
   * `mapPaymentStatus`, which turns the generic `'paid'` into `PAID_ONLINE` — so the
   * channel resolver must read this, or it can never see the unknown case (F18).
   */
  rawPaymentStatus: string | null;
  /** Refund amount in dollars (null until a refund is recorded). */
  refundAmount: number | null;
  refundNotes: string | null;
  refundedAt: string | null;
  entries: EntryManagementEntry[];
}

export function groupEntriesByEnrollment(allEntries: EntryManagementEntry[]): EnrollmentGroup[] {
  const map = new Map<string, EnrollmentGroup>();

  // MYK9-639: the superseded half of a move-up is not a second line on the
  // exhibitor's card — the dog runs once. Its money is not lost with it: the
  // surviving row takes its fee and payment from its root, because a move-up
  // destination is created money-neutral.
  const attribution = buildMoneyAttribution(allEntries);
  const entries = attribution.live;

  for (const entry of entries) {
    const moneyRoot = attribution.rootById.get(entry.id) ?? entry;
    // Online (webhook-created) entries have no registrationId — group them by
    // Stripe ORDER (payment intent) so unrelated exhibitors never collapse
    // into one card with mixed handlers/totals/refund status (Codex P1,
    // PR #625). Entries with neither key stand alone rather than falsely merge.
    const key =
      entry.registrationId ||
      (entry.stripePaymentIntentId ? `pi:${entry.stripePaymentIntentId}` : `entry:${entry.id}`);

    if (!map.has(key)) {
      const hasEnrollmentTotal = entry.enrollmentTotalAmount != null;
      map.set(key, {
        groupKey: key,
        enrollmentId: entry.registrationId || null,
        confirmationNumber: entry.confirmationNumber ?? null,
        handlerName: entry.handlerName,
        paymentStatus: getEffectivePaymentStatus(entry),
        totalAmount: hasEnrollmentTotal ? entry.enrollmentTotalAmount! : 0,
        totalAmountUnit: hasEnrollmentTotal ? 'cents' : 'dollars',
        // Dollar-unit groups start at 0 and accumulate per-entry below;
        // mixing the enrollment figure in would double-count.
        paidAmount: hasEnrollmentTotal ? (entry.enrollmentPaidAmount ?? 0) : 0,
        paymentReference: entry.enrollmentPaymentReference ?? null,
        paymentMethod: entry.paymentMethod ?? null,
        rawPaymentStatus: entry.rawPaymentStatus ?? null,
        refundAmount: entry.enrollmentRefundAmount ?? null,
        refundNotes: entry.enrollmentRefundNotes ?? null,
        refundedAt: entry.enrollmentRefundedAt ?? null,
        entries: [],
      });
    }

    const group = map.get(key)!;
    group.entries.push(entry);

    if (group.totalAmountUnit === 'dollars') {
      // No enrollment record (online/pi-grouped or standalone entries): both
      // figures come from the entries themselves. With an enrollment, its
      // total/paid stay authoritative and are never accumulated.
      //
      // MYK9-639: from the ROOT, once per run. Reading the destination's own
      // figures would show the exhibitor $0; reading both halves would show
      // them double.
      group.totalAmount += moneyRoot.totalFee;
      group.paidAmount += moneyRoot.paidAmount;
    }
  }

  // Entry-level Stripe refunds (online checkout has no enrollment record):
  // aggregate them up to the group so one refunded entry of several reads
  // "Partial Refund", not the first entry's status masquerading as the group's.
  // Enrollment-level fields, when present, stay authoritative.
  for (const group of map.values()) {
    const hasEnrollmentStatus = group.entries.some(e => e.enrollmentPaymentStatus != null);

    // The group's status is an AGGREGATE over every entry, never the one the
    // iteration reached first (MYK9-495 round 2). An order of four entries with
    // three paid and one pending rendered "Paid" and the full total when the
    // pending entry sorted last, and "Pending" when it sorted first — the same
    // money, two different cards.
    //
    // Any entry that still owes makes the whole group owe; nothing else about
    // the precedence changes. For a settled group the ENROLLMENT's own status
    // is the group's, which is both the finer value (payment method) and
    // order-independent — every entry in an enrollment group shares one
    // enrollment row. A pi-grouped (online) group has no enrollment row, so it
    // falls back to the first entry's effective status exactly as before and
    // the refund pass below refines it.
    const effectiveStatuses = group.entries.map(getEffectivePaymentStatus);
    if (effectiveStatuses.includes(PaymentStatus.PENDING)) {
      group.paymentStatus = PaymentStatus.PENDING;
    } else {
      const enrollmentStatus = group.entries.find(
        e => e.enrollmentPaymentStatus != null
      )?.enrollmentPaymentStatus;
      group.paymentStatus = enrollmentStatus ?? effectiveStatuses[0] ?? group.paymentStatus;
    }
    const refunded = group.entries.filter(e => e.paymentStatus === PaymentStatus.REFUNDED);

    if (!hasEnrollmentStatus && refunded.length > 0) {
      // "Every entry refunded" is not "all the money came back": the refund
      // function flips payment_status to 'refunded' for PARTIAL refunds too
      // (round-12 P2). The dollars comparison only applies when totalAmount
      // is dollars — a cents-unit group here (enrollment total without an
      // enrollment status) is improbable, but comparing dollars to cents
      // would mislabel it (round-13 review).
      const refundDollars = group.entries.reduce((sum, e) => sum + (e.refundAmount ?? 0), 0);
      const moneyFullyBack =
        group.totalAmountUnit !== 'dollars' || refundDollars >= group.totalAmount;
      group.paymentStatus =
        refunded.length === group.entries.length && moneyFullyBack
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIAL_REFUND;
    }

    if (group.refundAmount == null) {
      const entryRefundTotal = group.entries.reduce((sum, e) => sum + (e.refundAmount ?? 0), 0);
      if (entryRefundTotal > 0) {
        group.refundAmount = entryRefundTotal;
        // .slice(-1)[0] (ES2020-safe) instead of .at(-1): the build targets
        // chrome87/safari14.1, which predate Array.prototype.at and esbuild does
        // not polyfill runtime APIs.
        group.refundedAt =
          group.entries
            .map(e => e.refundedAt)
            .filter((t): t is string => t != null)
            .sort()
            .slice(-1)[0] ?? null;
      }
    }
  }

  return [...map.values()];
}
