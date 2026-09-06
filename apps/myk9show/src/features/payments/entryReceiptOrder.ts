import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

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
}

function mapReceiptOrder(row: EntryReceiptOrderRow): EntryReceiptOrder {
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

async function fetchEntryReceiptOrder(orderId: string): Promise<EntryReceiptOrder | null> {
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

async function fetchEntryReceiptOrdersForEntries(entryIds: string[]): Promise<EntryReceiptOrder[]> {
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
  /**
   * Post-hoc refunds as the APP recorded them, summed over the order's entries.
   *
   * The same money `stripe_orders.refunded_cents` describes, written by a
   * different actor at a different time: `stripe-refund-entry` sets
   * `entries.refund_amount` synchronously, while `refunded_cents` is only ever
   * written by the webhook's `recordOrderRefundCents` when Stripe delivers the
   * event. A receipt read inside that window would state a gross with no
   * refund while the My Payments row that linked to it — which derives from
   * `entries.refund_amount` — already shows one.
   */
  entryRefundedCents: number;
}

async function fetchDeepLinkedReceipt(orderId: string): Promise<DeepLinkedReceipt | null> {
  const order = await fetchEntryReceiptOrder(orderId);
  if (!order) return null;
  if (order.entryIds.length === 0) return { order, entryRefundedCents: 0 };

  const { data, error } = await supabase
    .from('entries')
    .select('id, refund_amount')
    .in('id', order.entryIds);
  if (error) throw error;

  // Same cents conversion useMyPayments applies, so the two screens round a
  // fractional-dollar refund the same way.
  const entryRefundedCents = ((data ?? []) as Array<{ refund_amount: number | null }>).reduce(
    (sum, row) => sum + Math.round((row.refund_amount ?? 0) * 100),
    0
  );
  return { order, entryRefundedCents };
}

export function useDeepLinkedReceiptOrder(orderId: string | null) {
  return useQuery({
    queryKey: ['exhibitor', 'deep-linked-receipt-order', orderId],
    queryFn: () => fetchDeepLinkedReceipt(orderId!),
    enabled: Boolean(orderId),
    ...cacheStrategies.moderate,
  });
}

interface UseEntryReceiptOrdersInput {
  requestedOrderId: string | null;
  entryIds: string[];
  enabled: boolean;
}

export function useEntryReceiptOrders({
  requestedOrderId,
  entryIds,
  enabled,
}: UseEntryReceiptOrdersInput) {
  const stableEntryIds = [...entryIds].sort();
  return useQuery({
    queryKey: ['exhibitor', 'entry-receipt-orders', requestedOrderId, stableEntryIds],
    queryFn: async () => {
      if (!requestedOrderId) return fetchEntryReceiptOrdersForEntries(stableEntryIds);

      const requested = await fetchEntryReceiptOrder(requestedOrderId);
      // A deep-linked orderId outlives the dialog that used it. If it does not
      // cover any of this card's rows, it belongs to a different card and
      // asking only for it would strand this one on a receipt with no charge
      // detail and nothing saying why. Fall through to discovery instead.
      const coversThisCard = requested?.entryIds.some(id => stableEntryIds.includes(id));
      if (requested && coversThisCard) return [requested];
      return stableEntryIds.length > 0 ? fetchEntryReceiptOrdersForEntries(stableEntryIds) : [];
    },
    enabled: enabled && (Boolean(requestedOrderId) || stableEntryIds.length > 0),
    ...cacheStrategies.moderate,
  });
}
