import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cacheStrategies } from '@/lib/queryClient';
import type { PaymentPresentationRefund } from './moneyPresentation';
import {
  ALL_PAYMENT_YEARS,
  paymentYearQueryRange,
  type PaymentYearQueryRange,
  type PaymentYearSelection,
} from './paymentYearFilter';

const PAYMENT_ORDER_PAGE_SIZE = 100;
const ENTRY_ID_CHUNK_SIZE = 100;
const ORDER_SELECT =
  'id, amount_cents, currency, status, paid_at, refunded_at, created_at, stripe_payment_intent_id, entry_ids, show_id, show:show_id(name)';

interface StripeOrderRow {
  id: string;
  amount_cents: number;
  currency: string | null;
  status: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string | null;
  stripe_payment_intent_id: string | null;
  entry_ids: string[] | null;
  show_id: string | null;
  show: { name: string } | null;
}

interface RefundEntryRow {
  id: string;
  refund_amount: number | null;
  refunded_at: string | null;
  dogs: { call_name: string | null } | null;
  classes: { name: string | null } | null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

function orderYearPredicate(range: PaymentYearQueryRange): string {
  return [
    `and(paid_at.gte.${range.start},paid_at.lt.${range.end})`,
    `and(paid_at.is.null,created_at.gte.${range.start},created_at.lt.${range.end})`,
    `and(refunded_at.gte.${range.start},refunded_at.lt.${range.end})`,
  ].join(',');
}

async function fetchOrderPages(options: {
  range?: PaymentYearQueryRange;
  refundedEntryIds?: string[];
}): Promise<StripeOrderRow[]> {
  const rows: StripeOrderRow[] = [];

  for (let from = 0; ; from += PAYMENT_ORDER_PAGE_SIZE) {
    let query = supabase
      .from('stripe_orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false });

    if (options.range) query = query.or(orderYearPredicate(options.range));
    if (options.refundedEntryIds) {
      query = query.overlaps('entry_ids', options.refundedEntryIds);
    }

    const { data, error } = await query.range(from, from + PAYMENT_ORDER_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as unknown as StripeOrderRow[];
    rows.push(...page);
    if (page.length < PAYMENT_ORDER_PAGE_SIZE) return rows;
  }
}

async function fetchRefundedEntryIds(range: PaymentYearQueryRange): Promise<string[]> {
  const ids: string[] = [];

  for (let from = 0; ; from += PAYMENT_ORDER_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('entries')
      .select('id')
      .gte('refunded_at', range.start)
      .lt('refunded_at', range.end)
      .order('refunded_at', { ascending: false })
      .range(from, from + PAYMENT_ORDER_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data ?? [];
    ids.push(...page.map(entry => entry.id));
    if (page.length < PAYMENT_ORDER_PAGE_SIZE) return ids;
  }
}

async function fetchOrders(selection: PaymentYearSelection): Promise<StripeOrderRow[]> {
  const range = paymentYearQueryRange(selection);
  if (!range) return fetchOrderPages({});

  const ordersById = new Map<string, StripeOrderRow>();
  for (const order of await fetchOrderPages({ range })) ordersById.set(order.id, order);

  // Entry-level refunds are the authoritative partial-refund record. Include
  // their older owning order so a 2025 charge refunded in 2026 still produces
  // the 2026 cash-basis refund row after the server-side order date filter.
  const refundedEntryIds = await fetchRefundedEntryIds(range);
  for (const entryIdChunk of chunks(refundedEntryIds, ENTRY_ID_CHUNK_SIZE)) {
    for (const order of await fetchOrderPages({ refundedEntryIds: entryIdChunk })) {
      ordersById.set(order.id, order);
    }
  }

  if (ordersById.size === 0) {
    // Preserve the existing stale-link contract: a year with no ledger rows
    // falls back to the complete all-time ledger instead of claiming the user
    // has no payments. Each all-time request is still explicitly paged.
    return fetchOrderPages({});
  }

  return [...ordersById.values()].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
}

async function fetchEntryDetails(entryIds: string[]): Promise<RefundEntryRow[]> {
  const rows: RefundEntryRow[] = [];
  for (const entryIdChunk of chunks(entryIds, ENTRY_ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, refund_amount, refunded_at, dogs(call_name), classes(name)')
      .in('id', entryIdChunk);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as RefundEntryRow[]));
  }
  return rows;
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
  /**
   * When the ORDER as a whole was refunded. Only meaningful for the legacy /
   * dashboard-refund path, where the money came back without entry-level
   * `entries.refund_amount` rows to date it. Without this the synthetic refund
   * row inherits the charge date and a 2025 charge refunded in 2026 subtotals
   * under 2025, which is wrong on a cash basis.
   */
  refundedAt: string | null;
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
export function useMyPayments(selection: PaymentYearSelection = ALL_PAYMENT_YEARS) {
  return useQuery({
    queryKey: ['exhibitor', 'my-payments', selection],
    queryFn: async (): Promise<MyPayment[]> => {
      const orders = await fetchOrders(selection);
      const entryIds = [...new Set(orders.flatMap(o => o.entry_ids ?? []))];
      const refundsByEntryId = new Map<string, number>();
      const refundDetailsByEntryId = new Map<string, PaymentPresentationRefund>();

      if (entryIds.length > 0) {
        for (const entry of await fetchEntryDetails(entryIds)) {
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
          refundedAt: o.refunded_at ?? null,
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
