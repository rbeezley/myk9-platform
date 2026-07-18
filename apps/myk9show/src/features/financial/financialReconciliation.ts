// Typed client wrappers for the server-authorized, PII-free financial
// reconciliation RPCs (financial-reconciliation, MYK9-54, task 1.6).
//
// These call the SECURITY DEFINER functions added in migration
// 20260717130000_financial_reconciliation_rpc.sql. Authorization and totals
// aggregation happen ON THE SERVER — this module is pure mapping only (no React,
// no hooks): it shapes the scope arguments and maps raw RPC rows into typed,
// camelCase results. The client never reads stripe_orders directly.
//
// The RPCs RAISE for an unauthorized caller, so `error` is a real permission
// failure, not an empty result — callers should surface it, never treat it as $0.
import { supabase } from '@/lib/supabase';

// The reconciliation RPCs are added in migration 20260717130000 and are not yet
// in the generated Database types (those regenerate only after the migration is
// deployed). Route every call through this cast so the module stays type-clean
// until then; a returned `error` is a real failure (the RPC RAISEs for an
// unauthorized caller) and is thrown, never swallowed as an empty result.
async function callFinancialRpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const rpc = supabase.rpc as unknown as (
    name: string,
    params: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc(fn, args);
  if (error) throw error;
  return (data as T[] | null) ?? [];
}

/** Which financial scope to reconcile. Show scope needs a showId; club a clubId. */
export type FinancialScope = 'platform' | 'club' | 'show';

export interface FinancialScopeArgs {
  scope: FinancialScope;
  /** Required when scope === 'club'. */
  clubId?: string | null;
  /** Required when scope === 'show'. */
  showId?: string | null;
}

/** Server-aggregated reconciliation totals. Charge facts and payout settlement
 *  are kept as separate figures — never a single conflated number. */
export interface FinancialReconciliationSummary {
  // Charge verification (stripe_orders) — ENTRY orders only. One-time 'payment'
  // orders carry no platform-fee snapshot and are deliberately excluded from
  // every entry/fee figure; they surface in the nonEntry* pair below.
  orderCount: number;
  grossChargedCents: number;
  entrySubtotalCents: number;
  platformFeeCents: number;
  /** SUM of CAPTURED processing fees only; pending ones are counted, not summed. */
  processingFeeCents: number;
  /** Orders whose Stripe processing fee is not yet captured (net income pending). */
  processingFeePendingCount: number;
  /** TOTAL returned to customers, including cart-overflow make-whole refunds.
   *  Correct for "online collected" (money really did leave), but NOT the
   *  platform's loss — use postHocRefundedCents for net income. */
  refundedCents: number;
  /** The portion of refundedCents the PLATFORM actually absorbed: post-hoc
   *  refunds on accepted entries (club kept its transfer, platform repaid the
   *  customer). Excludes cart-overflow make-whole refunds, on which the platform
   *  never earned a fee and never made a transfer. Server-derived per order as
   *  max(0, refunded − max(0, amount − subtotal − fee)); NULL-snapshot legacy
   *  orders conservatively attribute their full refund here. */
  postHocRefundedCents: number;
  /** Legacy entry orders with no platform-fee snapshot (rate-unverifiable). */
  snapshotMissingCount: number;
  /** Succeeded/refunded charges that are NOT entry orders (one-time 'payment',
   *  or legacy NULL order_type). Reported separately, never folded into the
   *  entry/fee figures above. */
  nonEntryOrderCount: number;
  nonEntryGrossCents: number;
  // Payout settlement (show_payouts) — independent of charge facts
  payoutCount: number;
  payoutCompletedCents: number;
  payoutPendingCents: number;
  /** Failed transfers are still money owed to the club — kept as its own total,
   *  never merged into payoutPendingCents. Outstanding = pending + failed. */
  payoutFailedCents: number;
  payoutFailedCount: number;
}

/** One PII-free charge-fact row. No customer id, name, or email is exposed. */
export interface FinancialReconciliationOrder {
  orderId: string;
  showId: string | null;
  status: string;
  orderType: string | null;
  amountCents: number;
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
  platformFeeRate: number | null;
  /** Null = processing fee pending (not yet captured), never zero. */
  stripeProcessingFeeCents: number | null;
  refundedCents: number;
  stripePaymentIntentId: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

/**
 * Split one order's cumulative `refundedCents` into the part the PLATFORM
 * actually absorbed. Mirrors the per-order expression the reconciliation summary
 * RPC aggregates (migration 20260717130000) — the SQL is the authority for the
 * dashboard totals; this is the same rule for a single detail row.
 *
 *   overflowPortion = max(0, amount − entrySubtotal − platformFee)
 *   postHocAbsorbed = max(0, refunded − overflowPortion)
 *
 * The overflow portion is a cart-overflow "make-whole" auto-refund for lines that
 * were denied / waitlisted / never served: no platform fee was earned and no club
 * transfer was made on them, so handing that money back is NOT a platform loss.
 * A post-hoc refund on an ACCEPTED entry is: the club keeps its transfer and the
 * platform repays the customer from its own balance.
 *
 * Legacy rows with no snapshot (`entrySubtotalCents` or `platformFeeCents` null)
 * cannot have overflow derived — coalescing to 0 would make the overflow the whole
 * charge and hide the entire refund. Conservative documented choice: attribute the
 * FULL refund to the platform (may understate net income, the safe direction).
 */
export function derivePostHocRefundedCents(order: {
  amountCents: number;
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
  refundedCents: number;
}): number {
  const refunded = Math.max(0, order.refundedCents);
  if (order.entrySubtotalCents == null || order.platformFeeCents == null) return refunded;
  const overflowPortion = Math.max(
    0,
    order.amountCents - order.entrySubtotalCents - order.platformFeeCents
  );
  return Math.max(0, refunded - overflowPortion);
}

/** One PII-free payout settlement row, carrying the copyable transfer id. */
export interface FinancialReconciliationPayout {
  payoutId: string;
  showId: string | null;
  status: string;
  amountCents: number;
  stripeTransferId: string | null;
  scheduledDate: string | null;
  completedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** Keyset cursor for paginating detail rows to completion. Pass the last row's
 *  { createdAt, id } back as the cursor to fetch the next page. */
export interface FinancialPageCursor {
  createdAt: string;
  id: string;
}

interface DetailPageParams extends FinancialScopeArgs {
  limit?: number;
  cursor?: FinancialPageCursor | null;
}

function scopeRpcArgs({ scope, clubId, showId }: FinancialScopeArgs) {
  return {
    p_scope: scope,
    p_club_id: scope === 'club' ? (clubId ?? null) : null,
    p_show_id: scope === 'show' ? (showId ?? null) : null,
  };
}

function toNum(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Raw row shapes returned by the RPCs (snake_case, bigints may arrive as strings).
interface SummaryRow {
  order_count: number | string;
  gross_charged_cents: number | string;
  entry_subtotal_cents: number | string;
  platform_fee_cents: number | string;
  processing_fee_cents: number | string;
  processing_fee_pending_count: number | string;
  refunded_cents: number | string;
  post_hoc_refunded_cents: number | string;
  snapshot_missing_count: number | string;
  non_entry_order_count: number | string;
  non_entry_gross_cents: number | string;
  payout_count: number | string;
  payout_completed_cents: number | string;
  payout_pending_cents: number | string;
  payout_failed_cents: number | string;
  payout_failed_count: number | string;
}

interface OrderRow {
  order_id: string;
  show_id: string | null;
  status: string;
  order_type: string | null;
  amount_cents: number | string;
  entry_subtotal_cents: number | string | null;
  platform_fee_cents: number | string | null;
  platform_fee_rate: number | string | null;
  stripe_processing_fee_cents: number | string | null;
  refunded_cents: number | string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

interface PayoutRow {
  payout_id: string;
  show_id: string | null;
  status: string;
  amount_cents: number | string;
  stripe_transfer_id: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export function mapSummaryRow(row: SummaryRow): FinancialReconciliationSummary {
  return {
    orderCount: toNum(row.order_count),
    grossChargedCents: toNum(row.gross_charged_cents),
    entrySubtotalCents: toNum(row.entry_subtotal_cents),
    platformFeeCents: toNum(row.platform_fee_cents),
    processingFeeCents: toNum(row.processing_fee_cents),
    processingFeePendingCount: toNum(row.processing_fee_pending_count),
    refundedCents: toNum(row.refunded_cents),
    postHocRefundedCents: toNum(row.post_hoc_refunded_cents),
    snapshotMissingCount: toNum(row.snapshot_missing_count),
    nonEntryOrderCount: toNum(row.non_entry_order_count),
    nonEntryGrossCents: toNum(row.non_entry_gross_cents),
    payoutCount: toNum(row.payout_count),
    payoutCompletedCents: toNum(row.payout_completed_cents),
    payoutPendingCents: toNum(row.payout_pending_cents),
    payoutFailedCents: toNum(row.payout_failed_cents),
    payoutFailedCount: toNum(row.payout_failed_count),
  };
}

export function mapOrderRow(row: OrderRow): FinancialReconciliationOrder {
  return {
    orderId: row.order_id,
    showId: row.show_id,
    status: row.status,
    orderType: row.order_type,
    amountCents: toNum(row.amount_cents),
    entrySubtotalCents: toNumOrNull(row.entry_subtotal_cents),
    platformFeeCents: toNumOrNull(row.platform_fee_cents),
    platformFeeRate: toNumOrNull(row.platform_fee_rate),
    stripeProcessingFeeCents: toNumOrNull(row.stripe_processing_fee_cents),
    refundedCents: toNum(row.refunded_cents),
    stripePaymentIntentId: row.stripe_payment_intent_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
  };
}

export function mapPayoutRow(row: PayoutRow): FinancialReconciliationPayout {
  return {
    payoutId: row.payout_id,
    showId: row.show_id,
    status: row.status,
    amountCents: toNum(row.amount_cents),
    stripeTransferId: row.stripe_transfer_id,
    scheduledDate: row.scheduled_date,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
  };
}

/** Server-aggregated summary for the authorized scope. Throws on an
 *  authorization or query failure (the RPC RAISEs for an unauthorized caller). */
export async function fetchFinancialReconciliationSummary(
  args: FinancialScopeArgs
): Promise<FinancialReconciliationSummary> {
  const rows = await callFinancialRpc<SummaryRow>(
    'financial_reconciliation_summary',
    scopeRpcArgs(args)
  );
  // No row is an authorized-but-empty scope; return zeroed totals.
  const row = rows[0];
  if (!row) return mapSummaryRow(EMPTY_SUMMARY_ROW);
  return mapSummaryRow(row);
}

const EMPTY_SUMMARY_ROW: SummaryRow = {
  order_count: 0,
  gross_charged_cents: 0,
  entry_subtotal_cents: 0,
  platform_fee_cents: 0,
  processing_fee_cents: 0,
  processing_fee_pending_count: 0,
  refunded_cents: 0,
  post_hoc_refunded_cents: 0,
  snapshot_missing_count: 0,
  non_entry_order_count: 0,
  non_entry_gross_cents: 0,
  payout_count: 0,
  payout_completed_cents: 0,
  payout_pending_cents: 0,
  payout_failed_cents: 0,
  payout_failed_count: 0,
};

/** One page of PII-free charge-fact rows. Pass the last row as the next cursor. */
export async function fetchFinancialReconciliationOrders(
  params: DetailPageParams
): Promise<FinancialReconciliationOrder[]> {
  const { limit, cursor, ...scope } = params;
  const rows = await callFinancialRpc<OrderRow>('financial_reconciliation_orders', {
    ...scopeRpcArgs(scope),
    p_limit: limit ?? 200,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  return rows.map(mapOrderRow);
}

/** One page of PII-free payout settlement rows. Pass the last row as the next cursor. */
export async function fetchFinancialReconciliationPayouts(
  params: DetailPageParams
): Promise<FinancialReconciliationPayout[]> {
  const { limit, cursor, ...scope } = params;
  const rows = await callFinancialRpc<PayoutRow>('financial_reconciliation_payouts', {
    ...scopeRpcArgs(scope),
    p_limit: limit ?? 200,
    p_after_created_at: cursor?.createdAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  return rows.map(mapPayoutRow);
}

/** Derive the next keyset cursor from a detail page, or null when exhausted. */
export function nextCursor(
  rows: Array<{ createdAt: string; orderId?: string; payoutId?: string }>,
  pageSize: number
): FinancialPageCursor | null {
  if (rows.length < pageSize || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const id = last.orderId ?? last.payoutId;
  if (!id) return null;
  return { createdAt: last.createdAt, id };
}
