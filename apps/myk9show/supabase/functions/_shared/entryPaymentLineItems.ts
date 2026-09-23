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
  has_more?: boolean;
}

export interface EntryPaymentLineItemClient {
  listLineItems(
    sessionId: string,
    params: { limit: number; expand: string[] }
  ): Promise<EntryPaymentLineItemPage>;
}

export type EntrySettlementLinePrice = { lineId: string; priceCents: number };
export type EntrySettlementLineIdKind = 'cart_item_id' | 'entry_id';

export class InvalidEntrySettlementLinesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntrySettlementLinesError';
  }
}

/** Reads complete, uniquely identified entry lines for the settlement RPC. */
export async function loadEntrySettlementLinePricesFromStripe(
  client: EntryPaymentLineItemClient,
  sessionId: string,
  lineIdKind: EntrySettlementLineIdKind
): Promise<EntrySettlementLinePrice[]> {
  const page = await client.listLineItems(sessionId, {
    limit: 100,
    expand: ['data.price.product'],
  });
  if (page.has_more) {
    throw new InvalidEntrySettlementLinesError(
      'Stripe returned more than 100 checkout lines; settlement evidence is incomplete.'
    );
  }
  const result: EntrySettlementLinePrice[] = [];
  const seen = new Set<string>();

  for (const item of page.data) {
    const metadata = readProductMetadata(item.price);
    if (metadata?.type !== 'entry') continue;

    const lineId = metadata[lineIdKind];
    if (!lineId || !Number.isSafeInteger(item.amount_total) || item.amount_total! < 0) {
      throw new InvalidEntrySettlementLinesError(
        `Stripe entry line is missing ${lineIdKind} or an integer amount.`
      );
    }
    if (seen.has(lineId)) {
      throw new InvalidEntrySettlementLinesError(`Stripe contains duplicate entry line ${lineId}.`);
    }
    seen.add(lineId);
    result.push({ lineId, priceCents: item.amount_total! });
  }

  if (result.length === 0) {
    throw new InvalidEntrySettlementLinesError(
      'Stripe session contains no identified entry lines.'
    );
  }
  return result;
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
  const productEntryId = readProductMetadata(price)?.entry_id;
  if (productEntryId) return productEntryId;
  if (!price || typeof price === 'string') return null;
  return price.metadata?.entry_id ?? null;
}

function readProductMetadata(price: EntryPaymentLineItem['price']): Record<string, string> | null {
  if (!price || typeof price === 'string') return null;
  const product = price.product;
  if (product && typeof product !== 'string' && product.metadata) return product.metadata;
  return price.metadata ?? null;
}
