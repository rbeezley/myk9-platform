// Shared, scoped financial summary service (unified-financial-dashboard,
// MYK9-54, task 2.2).
//
// getFinancialSummary composes FOUR groups that are kept SEPARATE and never
// conflated into one number:
//   1. entryAccounting     cent-based projection over every financially active
//                          entry (entryAccounting.ts)
//   2. platformIncome      gross vs net platform fee income, pending-aware
//                          (orderSnapshot helpers + reconciliation RPC totals)
//   3. chargeVerification  Verified / Attested / Mismatch + pending-net counts
//   4. payoutSettlement    transfer settlement, independent of charge verification
//
// It performs NO raw client reads that bypass RLS: the only server reads go
// through the SECURITY DEFINER reconciliation RPC wrappers (financialReconciliation.ts),
// which authorize scope on the server. Entry rows are passed in by the caller from
// its existing RLS-scoped query — this module never touches supabase directly.
import type { ReportEntry } from '@/lib/reports/types';
import type { FinancialReportMode } from '@/components/reports/financialReportTotals';
import { calculateEntryAccounting, type EntryAccountingProjection } from './entryAccounting';
import {
  emptyChargeVerificationSummary,
  resolveEntryChargeVerification,
  type ChargeVerificationSummary,
} from './chargeVerification';
import {
  fetchFinancialReconciliationSummary,
  type FinancialReconciliationOrder,
  type FinancialReconciliationSummary,
  type FinancialScope,
  type FinancialScopeArgs,
} from './financialReconciliation';

/** Platform income: gross fee income kept explicitly distinct from net. */
export interface PlatformIncomeSummary {
  /** Online money actually retained: gross charged less BOTH kinds of refund
   *  (post-hoc and cart-overflow make-whole) — both really did leave. */
  onlineCollectedCents: number;
  /** Gross platform-fee income, before Stripe processing costs. */
  grossPlatformFeeCents: number;
  /**
   * Net platform income: gross platform fee − captured processing fee −
   * POST-HOC platform-absorbed refunds. Pending while ANY order's processing fee
   * is uncaptured — the missing fee is surfaced as pending, never treated as zero.
   * When available, may be negative if absorbed refunds exceed fee income.
   */
  netPlatformIncome:
    { status: 'available'; netCents: number } | { status: 'pending'; grossCents: number };
  processingFeePendingCount: number;
  /** POST-HOC refunds — the platform's real absorbed loss. Subtracted from net. */
  refundedCents: number;
  /** Cart-overflow make-whole refunds — returned to the customer but NOT a
   *  platform loss, so never subtracted from net income. */
  makeWholeRefundedCents: number;
  /** Legacy orders missing either snapshot column (rate-unverifiable). */
  snapshotMissingCount: number;
}

/** Payout settlement totals, independent of charge verification. */
export interface PayoutSettlementTotals {
  payoutCount: number;
  completedCents: number;
  pendingCents: number;
  /** Failed transfers are still owed to the club — kept separate from pending. */
  failedCents: number;
  failedCount: number;
  /** Total transfer liability still outstanding: pending + failed. A failed
   *  transfer has NOT settled, so omitting it understates what is owed. */
  outstandingCents: number;
}

export interface FinancialSummary {
  scope: FinancialScope;
  entryAccounting: EntryAccountingProjection;
  platformIncome: PlatformIncomeSummary;
  chargeVerification: ChargeVerificationSummary;
  payoutSettlement: PayoutSettlementTotals;
}

export interface FinancialSummaryInput extends FinancialScopeArgs {
  /** Entry rows from the caller's existing RLS-scoped query. */
  entries: ReportEntry[];
  /** Report mode for the printable-subset totals; default 'current'. */
  mode?: FinancialReportMode;
  /**
   * Optional Stripe order snapshots matched to entries by entry id, used to
   * resolve Verified/Mismatch for online lines. When absent, online lines cannot
   * be verified and resolve to Mismatch by charge-verification's contract.
   */
  matchedOrdersByEntryId?: Map<string, FinancialReconciliationOrder>;
}

export interface FinancialSummaryDeps {
  /** Injectable for tests; defaults to the real authorized RPC wrapper. */
  fetchSummary?: (args: FinancialScopeArgs) => Promise<FinancialReconciliationSummary>;
}

// Refund architecture (verified 2026-07-17 against stripe-refund-entry/index.ts
// and stripe-refund-show/index.ts): BOTH refund functions call
// stripe.refunds.create WITHOUT `reverse_transfer` and WITHOUT
// `refund_application_fee`. The customer is repaid the full charge from the
// PLATFORM balance while the club keeps its transfer, so the platform absorbs
// the FULL refunded amount of a POST-HOC refund — not merely its fee portion.
//
// Cart-overflow "make-whole" auto-refunds (lines denied / waitlisted / never
// served) are the OPPOSITE case: the platform earned NO fee on those lines
// (platform_fee_cents is computed on entry_subtotal_cents, i.e. paid lines only)
// and no club transfer was ever made for them, so returning that money is not a
// platform loss — it is money collected and handed straight back. Subtracting it
// would make net income read falsely negative.
//
// The two are recorded in SEPARATE explicit columns at write time (migration
// 20260717120000) and surface as separate summary totals, so nothing is derived
// here:
//   netPlatformIncome    subtracts refundedCents (post-hoc) ONLY.
//   onlineCollectedCents subtracts BOTH — a make-whole refund genuinely does
//                        reduce the money the platform ends up holding.

/** Derive the platform-income group from server-aggregated reconciliation totals. */
export function derivePlatformIncome(
  summary: FinancialReconciliationSummary
): PlatformIncomeSummary {
  const grossPlatformFeeCents = summary.platformFeeCents;
  // Platform-absorbed refunds: a POST-HOC refund comes out of the platform
  // balance in full (no reverse_transfer / refund_application_fee) while the club
  // keeps its transfer, so summary.refundedCents — which is now the POST-HOC
  // total, read straight from its own column — is a real platform cost against
  // net income. Cart-overflow make-whole refunds are deliberately NOT subtracted
  // (see the refund-architecture note above). This can still drive net NEGATIVE
  // (post-hoc refunds exceeded fee income) — that is economically real and is
  // reported as-is, never clamped to 0.
  const netPlatformIncome =
    summary.processingFeePendingCount > 0
      ? ({ status: 'pending', grossCents: grossPlatformFeeCents } as const)
      : ({
          status: 'available',
          netCents: grossPlatformFeeCents - summary.processingFeeCents - summary.refundedCents,
        } as const);
  return {
    // BOTH refunds subtracted here on purpose: a make-whole refund DOES reduce the
    // money the platform ends up holding, even though it is not a platform loss.
    onlineCollectedCents:
      summary.grossChargedCents - summary.refundedCents - summary.makeWholeRefundedCents,
    grossPlatformFeeCents,
    netPlatformIncome,
    processingFeePendingCount: summary.processingFeePendingCount,
    refundedCents: summary.refundedCents,
    makeWholeRefundedCents: summary.makeWholeRefundedCents,
    snapshotMissingCount: summary.snapshotMissingCount,
  };
}

/** Derive the payout-settlement group. Outstanding liability includes FAILED
 *  transfers: a failed transfer is money still owed to the club, so counting only
 *  pending would understate the platform's outstanding obligation. The server
 *  already excludes failures SUPERSEDED by a retry row (the show has a live
 *  payout), so an already-retried-and-paid show is not double-counted here. */
export function derivePayoutSettlement(
  summary: FinancialReconciliationSummary
): PayoutSettlementTotals {
  return {
    payoutCount: summary.payoutCount,
    completedCents: summary.payoutCompletedCents,
    pendingCents: summary.payoutPendingCents,
    failedCents: summary.payoutFailedCents,
    failedCount: summary.payoutFailedCount,
    outstandingCents: summary.payoutPendingCents + summary.payoutFailedCents,
  };
}

/** Aggregate charge-verification counts from entries + server reconciliation totals. */
export function deriveChargeVerification(
  entryAccounting: EntryAccountingProjection,
  summary: FinancialReconciliationSummary,
  matchedOrdersByEntryId?: Map<string, FinancialReconciliationOrder>
): ChargeVerificationSummary {
  const result = emptyChargeVerificationSummary();
  for (const line of entryAccounting.lines) {
    const state = resolveEntryChargeVerification({
      paymentLabel: line.paymentLabel,
      matchedOrder: matchedOrdersByEntryId?.get(line.entryId) ?? null,
    });
    if (state === 'Verified') result.verifiedCount += 1;
    else if (state === 'Attested') result.attestedCount += 1;
    else result.mismatchCount += 1;
  }
  result.pendingNetCount = summary.processingFeePendingCount;
  result.snapshotMissingCount = summary.snapshotMissingCount;
  return result;
}

/**
 * Build the scoped financial summary. Awaits the authorized reconciliation RPC
 * (throws on an unauthorized caller — never a silent $0) and composes it with the
 * pure entry-accounting projection. The four groups stay separate.
 */
export async function getFinancialSummary(
  input: FinancialSummaryInput,
  deps: FinancialSummaryDeps = {}
): Promise<FinancialSummary> {
  const fetchSummary = deps.fetchSummary ?? fetchFinancialReconciliationSummary;
  const { entries, mode = 'current', matchedOrdersByEntryId, ...scopeArgs } = input;

  const reconciliation = await fetchSummary(scopeArgs);
  const entryAccounting = calculateEntryAccounting(entries, mode);

  return {
    scope: scopeArgs.scope,
    entryAccounting,
    platformIncome: derivePlatformIncome(reconciliation),
    chargeVerification: deriveChargeVerification(
      entryAccounting,
      reconciliation,
      matchedOrdersByEntryId
    ),
    payoutSettlement: derivePayoutSettlement(reconciliation),
  };
}
