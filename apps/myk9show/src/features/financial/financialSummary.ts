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
  /** Online money collected: gross charged less refunded. */
  onlineCollectedCents: number;
  /** Gross platform-fee income, before Stripe processing costs. */
  grossPlatformFeeCents: number;
  /**
   * Net platform income. Pending while ANY order's processing fee is uncaptured —
   * the missing fee is surfaced as pending, never treated as zero.
   */
  netPlatformIncome:
    { status: 'available'; netCents: number } | { status: 'pending'; grossCents: number };
  processingFeePendingCount: number;
  refundedCents: number;
  /** Legacy orders with no platform-fee snapshot (rate-unverifiable). */
  snapshotMissingCount: number;
}

/** Payout settlement totals, independent of charge verification. */
export interface PayoutSettlementTotals {
  payoutCount: number;
  completedCents: number;
  pendingCents: number;
  failedCount: number;
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

/** Derive the platform-income group from server-aggregated reconciliation totals. */
export function derivePlatformIncome(
  summary: FinancialReconciliationSummary
): PlatformIncomeSummary {
  const grossPlatformFeeCents = summary.platformFeeCents;
  const netPlatformIncome =
    summary.processingFeePendingCount > 0
      ? ({ status: 'pending', grossCents: grossPlatformFeeCents } as const)
      : ({
          status: 'available',
          netCents: grossPlatformFeeCents - summary.processingFeeCents,
        } as const);
  return {
    onlineCollectedCents: summary.grossChargedCents - summary.refundedCents,
    grossPlatformFeeCents,
    netPlatformIncome,
    processingFeePendingCount: summary.processingFeePendingCount,
    refundedCents: summary.refundedCents,
    snapshotMissingCount: summary.snapshotMissingCount,
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
    payoutSettlement: {
      payoutCount: reconciliation.payoutCount,
      completedCents: reconciliation.payoutCompletedCents,
      pendingCents: reconciliation.payoutPendingCents,
      failedCount: reconciliation.payoutFailedCount,
    },
  };
}
