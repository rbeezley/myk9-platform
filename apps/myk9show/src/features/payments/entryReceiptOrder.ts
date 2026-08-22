import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';

const RECEIPT_ORDER_SELECT =
  'id, amount_cents, currency, stripe_payment_intent_id, status, entry_ids';

interface EntryReceiptOrderRow {
  id: string;
  amount_cents: number;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  status: string | null;
  entry_ids: string[] | null;
}

export interface EntryReceiptOrder {
  id: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  status: string;
  entryIds: string[];
}

function mapReceiptOrder(row: EntryReceiptOrderRow): EntryReceiptOrder {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency ?? 'usd',
    reference: row.stripe_payment_intent_id,
    status: row.status ?? 'unknown',
    entryIds: row.entry_ids ?? [],
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
  return ((data ?? []) as EntryReceiptOrderRow[])
    .map(mapReceiptOrder)
    .sort((left, right) => left.id.localeCompare(right.id));
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
