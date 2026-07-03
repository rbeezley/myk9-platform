import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { PaymentPresentationRefund } from './moneyPresentation';

interface RefundEntryRow {
  id: string;
  refund_amount: number | null;
  refunded_at: string | null;
  dogs: { call_name: string | null } | null;
  classes: { name: string | null } | null;
}

export interface MyPayment {
  id: string;
  /** Best display date: when paid, else created. ISO string or null. */
  date: string | null;
  /** show FK — scopes the cart-recovery deep-link for failed/cancelled orders. */
  showId: string | null;
  showName: string | null;
  /** Gross stripe_orders.amount_cents shown in the row. */
  amountCents: number;
  /** Gross order amount minus entry-level refunds recorded by app refund flows. */
  netPaidCents: number;
  currency: string;
  status: string;
  /** Stripe payment intent id — the reference an exhibitor can quote to support. */
  reference: string | null;
  /** entries this payment covers — drives the "View entries" receipt link. */
  entryIds: string[];
  /** Synthetic entry-level refund rows; current data stores refunds on entries. */
  refunds: PaymentPresentationRefund[];
}

/**
 * The logged-in exhibitor's own online payments, newest first. Reads stripe_orders
 * directly — RLS scopes rows to the caller (customer_id → stripe_customers.person_id
 * = get_my_person_id()), so no explicit owner filter is needed here. The show name
 * is embedded via the show_id FK (null for non-entry orders).
 */
export function useMyPayments() {
  return useQuery({
    queryKey: ['exhibitor', 'my-payments'],
    queryFn: async (): Promise<MyPayment[]> => {
      const { data, error } = await supabase
        .from('stripe_orders')
        .select(
          'id, amount_cents, currency, status, paid_at, created_at, stripe_payment_intent_id, entry_ids, show_id, show:show_id(name)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;

      const orders = data ?? [];
      const entryIds = [...new Set(orders.flatMap(o => o.entry_ids ?? []))];
      const refundsByEntryId = new Map<string, number>();
      const refundDetailsByEntryId = new Map<string, PaymentPresentationRefund>();

      if (entryIds.length > 0) {
        const { data: entries, error: entriesError } = await supabase
          .from('entries')
          .select('id, refund_amount, refunded_at, dogs(call_name), classes(name)')
          .in('id', entryIds);
        if (entriesError) throw entriesError;

        for (const entry of (entries ?? []) as RefundEntryRow[]) {
          const refundCents = Math.round((entry.refund_amount ?? 0) * 100);
          refundsByEntryId.set(entry.id, refundCents);
          if (refundCents <= 0) continue;

          const label = [entry.dogs?.call_name, entry.classes?.name].filter(Boolean).join(' - ');
          refundDetailsByEntryId.set(entry.id, {
            entryId: entry.id,
            amountCents: refundCents,
            date: entry.refunded_at ?? null,
            label,
          });
        }
      }

      return orders.map(o => {
        const entryRefundCents = (o.entry_ids ?? []).reduce(
          (sum, entryId) => sum + (refundsByEntryId.get(entryId) ?? 0),
          0
        );
        const amountCents = o.amount_cents;

        return {
          id: o.id,
          date: o.paid_at ?? o.created_at,
          showId: o.show_id ?? null,
          showName: (o.show as { name: string } | null)?.name ?? null,
          amountCents,
          netPaidCents: Math.max(0, amountCents - entryRefundCents),
          currency: o.currency ?? 'usd',
          status: o.status ?? 'unknown',
          reference: o.stripe_payment_intent_id,
          entryIds: o.entry_ids ?? [],
          refunds: (o.entry_ids ?? [])
            .map(entryId => refundDetailsByEntryId.get(entryId))
            .filter((refund): refund is PaymentPresentationRefund => Boolean(refund)),
        };
      });
    },
    ...cacheStrategies.moderate,
  });
}
