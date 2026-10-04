// Deno-free Stripe line-item readers: per-entry fees for payment-link refunds,
// and every charged line for a refund of a charge that served nothing (MYK9-966).

interface ExpandedProduct {
  name?: string | null;
  metadata?: Record<string, string> | null;
}

interface ExpandedPrice {
  metadata?: Record<string, string> | null;
  product?: string | ExpandedProduct | null;
}

interface EntryPaymentLineItem {
  amount_total?: number | null;
  /** The product name Stripe copies onto the line. */
  description?: string | null;
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

export async function loadEntryPaymentLineItemFeesFromStripe(
  client: EntryPaymentLineItemClient,
  sessionId: string
): Promise<Map<string, number>> {
  // Stripe caps this single-page read at 100 line items. Missing entries degrade
  // to the webhook's manual-refund alert path instead of guessing an amount.
  const lineItems = await listSessionLineItems(client, sessionId);
  return readEntryPaymentLineItemFees(lineItems.data);
}

function listSessionLineItems(
  client: EntryPaymentLineItemClient,
  sessionId: string
): Promise<EntryPaymentLineItemPage> {
  return client.listLineItems(sessionId, { limit: 100, expand: ['data.price.product'] });
}

/** One line Stripe charged, as the all-unserved refund reads it. */
export interface ChargedLine {
  amountCents: number | null;
  /** The entry the line paid for, when its metadata names one (payment links). */
  entryId: string | null;
  /** The "Service fee" line both checkout builders add when the fee is > 0. */
  isServiceFee: boolean;
}

/** Every line of a session, or null when Stripe returned more than one page. */
export async function loadChargedLinesFromStripe(
  client: EntryPaymentLineItemClient,
  sessionId: string
): Promise<ChargedLine[] | null> {
  const page = await listSessionLineItems(client, sessionId);
  return page.has_more ? null : readChargedLines(page.data);
}

const SERVICE_FEE_LINE_NAME = 'Service fee';

export function readChargedLines(lineItems: EntryPaymentLineItem[]): ChargedLine[] {
  return lineItems.map(item => {
    const price = item.price && typeof item.price !== 'string' ? item.price : null;
    const product = price?.product && typeof price.product !== 'string' ? price.product : null;
    const entryId = readEntryId(item.price);
    // A payment-link fee line is typed in its metadata; a cart fee line has no
    // metadata, only its name. A misread is caught by the caller's tie-out.
    const isServiceFee =
      product?.metadata?.type === 'platform_fee' ||
      (!entryId && (item.description ?? product?.name) === SERVICE_FEE_LINE_NAME);
    return {
      amountCents: typeof item.amount_total === 'number' ? item.amount_total : null,
      entryId,
      isServiceFee,
    };
  });
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
