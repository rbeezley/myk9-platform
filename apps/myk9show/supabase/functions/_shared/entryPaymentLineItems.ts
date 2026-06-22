// Deno-free Stripe line-item metadata reader for secretary payment-link refunds.

interface ExpandedProduct {
  metadata?: Record<string, string> | null;
}

interface ExpandedPrice {
  metadata?: Record<string, string> | null;
  product?: string | ExpandedProduct | null;
}

interface EntryPaymentLineItem {
  amount_total?: number | null;
  price?: string | ExpandedPrice | null;
}

interface EntryPaymentLineItemPage {
  data: EntryPaymentLineItem[];
}

export interface EntryPaymentLineItemClient {
  listLineItems(
    sessionId: string,
    params: { limit: number; expand: string[] }
  ): Promise<EntryPaymentLineItemPage>;
}

export async function loadEntryPaymentLineItemFeesFromStripe(
  client: EntryPaymentLineItemClient,
  sessionId: string
): Promise<Map<string, number>> {
  // Stripe caps this single-page read at 100 line items. Missing entries degrade
  // to the webhook's manual-refund alert path instead of guessing an amount.
  const lineItems = await client.listLineItems(sessionId, {
    limit: 100,
    expand: ['data.price.product'],
  });
  return readEntryPaymentLineItemFees(lineItems.data);
}

export function readEntryPaymentLineItemFees(
  lineItems: EntryPaymentLineItem[]
): Map<string, number> {
  const entryFeesById = new Map<string, number>();
  for (const item of lineItems) {
    const entryId = readEntryId(item.price);
    if (entryId && typeof item.amount_total === 'number') {
      entryFeesById.set(entryId, item.amount_total);
    }
  }
  return entryFeesById;
}

function readEntryId(price: EntryPaymentLineItem['price']): string | null {
  if (!price || typeof price === 'string') return null;

  const product = price.product;
  if (product && typeof product !== 'string') {
    const productEntryId = product.metadata?.entry_id;
    if (productEntryId) return productEntryId;
  }

  return price.metadata?.entry_id ?? null;
}
