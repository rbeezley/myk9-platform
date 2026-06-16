import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

export interface MyPayment {
  id: string;
  /** Best display date: when paid, else created. ISO string or null. */
  date: string | null;
  showName: string | null;
  amountCents: number;
  currency: string;
  status: string;
  /** Stripe payment intent id — the reference an exhibitor can quote to support. */
  reference: string | null;
  /** entries this payment covers — drives the "View entries" receipt link. */
  entryIds: string[];
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
          'id, amount_cents, currency, status, paid_at, created_at, stripe_payment_intent_id, entry_ids, show:show_id(name)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;

      return (data ?? []).map(o => ({
        id: o.id,
        date: o.paid_at ?? o.created_at,
        showName: (o.show as { name: string } | null)?.name ?? null,
        amountCents: o.amount_cents,
        currency: o.currency ?? 'usd',
        status: o.status ?? 'unknown',
        reference: o.stripe_payment_intent_id,
        entryIds: o.entry_ids ?? [],
      }));
    },
    ...cacheStrategies.moderate,
  });
}
