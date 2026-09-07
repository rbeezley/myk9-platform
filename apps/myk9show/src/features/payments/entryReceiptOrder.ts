import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import { viewerScope } from '@/lib/viewerScopedQueryKey';

// Every money column the receipt needs to ADD UP, not just the gross.
//
// `amount_cents` is the gross the customer was charged, and the platform fee is
// billed as its own Stripe line ON TOP of the entry fees. Printing the class
// rows against `amount_cents` alone produces a document whose total exceeds its
// line items by the fee on every online order. `entry_subtotal_cents` and
// `platform_fee_cents` are what make the arithmetic visible.
//
// The refund columns are not optional either: `_shared/orderSnapshot.ts` states
// the invariant plainly — a PARTIALLY refunded order keeps `status = 'succeeded'`
// with a non-zero refund column, so refunds must be read from the COLUMNS and
// never inferred from `status`. `make_whole_refunded_cents` is the cart-overflow
// auto-refund, which `amount_cents` is deliberately NOT netted by; in the
// capacity-split case this issue exists for, ignoring it overstates the receipt
// by exactly the overflow that was handed back.
//
// Keep this a SINGLE string literal. supabase-js infers the row type from the
// literal text of the select; a concatenated expression widens to `string` and
// every column comes back as GenericStringError.
// prettier-ignore
const RECEIPT_ORDER_SELECT = 'id, created_at, paid_at, amount_cents, currency, stripe_payment_intent_id, status, entry_ids, entry_subtotal_cents, platform_fee_cents, refunded_cents, make_whole_refunded_cents, refunded_at';

interface EntryReceiptOrderRow {
  id: string;
  created_at: string | null;
  paid_at: string | null;
  amount_cents: number;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  status: string | null;
  entry_ids: string[] | null;
  entry_subtotal_cents: number | null;
  platform_fee_cents: number | null;
  refunded_cents: number | null;
  make_whole_refunded_cents: number | null;
  refunded_at: string | null;
}

export interface EntryReceiptOrder {
  id: string;
  /** Row creation. Correct for ORDERING; wrong to print — see `paidOn`. */
  createdAt: string | null;
  /**
   * The date to show a human, always. Capture can lag creation (a delayed or
   * previously pending payment), and `useMyPayments` displays
   * `paid_at ?? created_at` — so printing `createdAt` makes a receipt disagree
   * with the very row that linked to it. Derived here rather than left to each
   * caller: two of them had already picked the wrong field.
   */
  paidOn: string | null;
  amountCents: number;
  currency: string;
  reference: string | null;
  status: string;
  entryIds: string[];
  entrySubtotalCents: number | null;
  platformFeeCents: number | null;
  /** Post-hoc refunds against this order. */
  refundedCents: number;
  /** Cart-overflow auto-refund; never netted out of amountCents. */
  makeWholeRefundedCents: number;
  refundedAt: string | null;
  /**
   * Post-hoc refunds as the APP recorded them, summed over this order's entry
   * rows — the same money `refundedCents` describes, written by a different
   * actor at a different time (see `orderRefundReconciliation`).
   *
   * Required, and deliberately absent from `mapReceiptOrder`'s output type: a
   * fetch path that forgot to resolve it would default to zero, which is the
   * UNDERSTATING direction. Making it unrepresentable until `withEntryRefunds`
   * has run is what stops that being a silent drop (MYK9-428).
   */
  entryRefundedCents: number;
}

/** One order as the `stripe_orders` row alone describes it — not yet complete. */
type ReceiptOrderSnapshot = Omit<EntryReceiptOrder, 'entryRefundedCents'>;

function mapReceiptOrder(row: EntryReceiptOrderRow): ReceiptOrderSnapshot {
  return {
    id: row.id,
    createdAt: row.created_at,
    paidOn: row.paid_at ?? row.created_at,
    amountCents: row.amount_cents,
    currency: row.currency ?? 'usd',
    reference: row.stripe_payment_intent_id,
    status: row.status ?? 'unknown',
    entryIds: row.entry_ids ?? [],
    entrySubtotalCents: row.entry_subtotal_cents,
    platformFeeCents: row.platform_fee_cents,
    refundedCents: row.refunded_cents ?? 0,
    makeWholeRefundedCents: row.make_whole_refunded_cents ?? 0,
    refundedAt: row.refunded_at,
  };
}

/**
 * `entries.refund_amount` for the given rows, in cents.
 *
 * The same cents conversion `useMyPayments` applies, so the receipt and the
 * ledger round a fractional-dollar refund identically.
 */
async function fetchEntryRefundCentsById(entryIds: string[]): Promise<Map<string, number>> {
  if (entryIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('entries')
    .select('id, refund_amount')
    .in('id', entryIds);
  if (error) throw error;

  return new Map(
    ((data ?? []) as Array<{ id: string; refund_amount: number | null }>).map(row => [
      row.id,
      Math.round((row.refund_amount ?? 0) * 100),
    ])
  );
}

/**
 * The ONLY way to produce an `EntryReceiptOrder`.
 *
 * One `entries` read covers every order, so a multi-order card costs the same
 * round trip as a single one.
 */
async function withEntryRefunds(orders: ReceiptOrderSnapshot[]): Promise<EntryReceiptOrder[]> {
  const refundCentsById = await fetchEntryRefundCentsById([
    ...new Set(orders.flatMap(order => order.entryIds)),
  ]);
  return orders.map(order => ({
    ...order,
    entryRefundedCents: order.entryIds.reduce(
      (sum, entryId) => sum + (refundCentsById.get(entryId) ?? 0),
      0
    ),
  }));
}

async function fetchEntryReceiptOrder(orderId: string): Promise<ReceiptOrderSnapshot | null> {
  // INTENT: This is an exact, independently keyed receipt read. Do not reuse
  // useMyPayments' year/range-bounded list query: an old order must remain
  // printable when the payments page is showing a different year.
  const { data, error } = await supabase
    .from('stripe_orders')
    .select(RECEIPT_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return mapReceiptOrder(data as EntryReceiptOrderRow);
}

async function fetchEntryReceiptOrdersForEntries(
  entryIds: string[]
): Promise<ReceiptOrderSnapshot[]> {
  const { data, error } = await supabase
    .from('stripe_orders')
    .select(RECEIPT_ORDER_SELECT)
    .overlaps('entry_ids', entryIds);
  if (error) throw error;
  // Oldest first: for a capacity split the original cart payment precedes the
  // waitlist promotion, which is the order a human expects to choose between.
  return ((data ?? []) as EntryReceiptOrderRow[])
    .map(mapReceiptOrder)
    .sort(
      (left, right) =>
        (left.createdAt ?? '').localeCompare(right.createdAt ?? '') ||
        left.id.localeCompare(right.id)
    );
}

/**
 * The exact order a `?orderId=` deep link names, and nothing else.
 *
 * Deliberately NOT `useEntryReceiptOrders`: that hook exists to pick a receipt
 * for one CARD, so it falls back to entry-id discovery whenever the requested
 * order does not cover that card's rows. The arrival panel has no card — it
 * describes the order in the URL — and it has to keep working in exactly the
 * case discovery cannot serve: when none of the order's entry rows have
 * replicated yet, the list shows the whole show and the payment facts are the
 * only thing on screen that is still certain.
 *
 * Safe to key off a URL param: `stripe_orders_select` scopes reads to the
 * caller's own `stripe_customers.person_id` (or a platform admin), so someone
 * else's order id returns no row rather than another exhibitor's money.
 */
export interface DeepLinkedReceipt {
  order: EntryReceiptOrder;
}

async function fetchDeepLinkedReceipt(orderId: string): Promise<DeepLinkedReceipt | null> {
  const order = await fetchEntryReceiptOrder(orderId);
  if (!order) return null;
  const [resolved] = await withEntryRefunds([order]);
  return resolved ? { order: resolved } : null;
}

export function useDeepLinkedReceiptOrder(orderId: string | null, viewerId: string | null) {
  return useQuery({
    // `viewerId` is part of the key, not decoration. The QueryClient is a
    // module singleton (`lib/queryClient.ts`) that nothing clears on sign-out,
    // and this data is cached for 5 minutes. Without the viewer in the key, one
    // exhibitor signing in after another in the same tab could be served the
    // previous account's amount and payment reference from cache, with no
    // request made and therefore no RLS check.
    queryKey: ['exhibitor', 'deep-linked-receipt-order', viewerScope(viewerId), orderId],
    queryFn: () => fetchDeepLinkedReceipt(orderId!),
    enabled: Boolean(orderId),
    ...cacheStrategies.moderate,
  });
}

interface UseEntryReceiptOrdersInput {
  requestedOrderId: string | null;
  entryIds: string[];
  enabled: boolean;
  /** The signed-in viewer, for cache scoping — see `useDeepLinkedReceiptOrder`. */
  viewerId: string | null;
}

export function useEntryReceiptOrders({
  requestedOrderId,
  entryIds,
  enabled,
  viewerId,
}: UseEntryReceiptOrdersInput) {
  const stableEntryIds = [...entryIds].sort();
  return useQuery({
    queryKey: [
      'exhibitor',
      'entry-receipt-orders',
      viewerScope(viewerId),
      requestedOrderId,
      stableEntryIds,
    ],
    queryFn: async () => {
      // Every branch returns through `withEntryRefunds`, so the dialog can
      // never be handed an order whose entry-side refunds were not resolved.
      if (!requestedOrderId) {
        return withEntryRefunds(await fetchEntryReceiptOrdersForEntries(stableEntryIds));
      }

      const requested = await fetchEntryReceiptOrder(requestedOrderId);
      // A deep-linked orderId outlives the dialog that used it. If it does not
      // cover any of this card's rows, it belongs to a different card and
      // asking only for it would strand this one on a receipt with no charge
      // detail and nothing saying why. Fall through to discovery instead.
      const coversThisCard = requested?.entryIds.some(id => stableEntryIds.includes(id));
      if (requested && coversThisCard) return withEntryRefunds([requested]);
      return stableEntryIds.length > 0
        ? withEntryRefunds(await fetchEntryReceiptOrdersForEntries(stableEntryIds))
        : [];
    },
    enabled: enabled && (Boolean(requestedOrderId) || stableEntryIds.length > 0),
    ...cacheStrategies.moderate,
  });
}
