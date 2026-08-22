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
const RECEIPT_ORDER_SELECT = 'id, created_at, amount_cents, currency, stripe_payment_intent_id, status, entry_ids, entry_subtotal_cents, platform_fee_cents, refunded_cents, make_whole_refunded_cents, refunded_at';

interface EntryReceiptOrderRow {
  id: string;
  created_at: string | null;
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
  createdAt: string | null;
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
      if (requestedOrderId) {
        const order = await fetchEntryReceiptOrder(requestedOrderId);
        return order ? [order] : [];
      }
      return fetchEntryReceiptOrdersForEntries(stableEntryIds);
    },
    enabled: enabled && (Boolean(requestedOrderId) || stableEntryIds.length > 0),
    ...cacheStrategies.moderate,
  });
}
