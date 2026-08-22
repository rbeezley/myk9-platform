import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

const RECEIPT_ORDER_SELECT = 'id, amount_cents, currency, stripe_payment_intent_id, entry_ids';

interface EntryReceiptOrderRow {
  id: string;
  amount_cents: number;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  entry_ids: string[] | null;
}

export interface EntryReceiptOrder {
  id: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  entryIds: string[];
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

  const row = data as EntryReceiptOrderRow;
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency ?? 'usd',
    reference: row.stripe_payment_intent_id,
    entryIds: row.entry_ids ?? [],
  };
}

export function useEntryReceiptOrder(orderId: string | null) {
  return useQuery({
    queryKey: ['exhibitor', 'entry-receipt-order', orderId],
    queryFn: () => fetchEntryReceiptOrder(orderId!),
    enabled: Boolean(orderId),
    ...cacheStrategies.moderate,
  });
}
