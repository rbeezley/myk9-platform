// Deno-free (colocated vitest). MYK9-2036: a paid cart checkout is verified
// against the prices the server sent to Stripe when the session was OPENED,
// never against the fee rule in force when the webhook runs.
//
// Where the snapshot lives: Stripe's own line items. stripe-checkout tags each
// cart line's product_data.metadata with the cart item id and the entry details
// that decided its price (cartLineSnapshotMetadata), tags the service-fee line,
// and stamps a snapshot version on the session (cartSessionSnapshotMetadata).
// The payer cannot write any of it, and it is exactly what the payer was charged.
//
// The round-15 tamper defence still holds: every cart number sessionMatchesCart
// compares is owner-writable, so the webhook checks the cart against Stripe's
// records (this module), not against itself. Each stored line fee is compared
// with its own snapshot line, so an owner raising fees and subtotal in lockstep
// is refused without consulting the current pricing rule.
//
// Sessions opened before this shipped carry no version and keep the re-price
// check (verifyPaidCartCharge). A failed Stripe read THROWS so the webhook
// answers non-2xx with the cart unclaimed and Stripe redelivers; only a read
// that succeeded with the wrong contents is a refusal.

import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee.ts';

/** Session metadata key and value that mark a session priced from a snapshot. */
export const CART_PRICE_SNAPSHOT_KEY = 'price_snapshot';
export const CART_PRICE_SNAPSHOT_VERSION = '1';

/**
 * One page of line items. Stripe Checkout takes at most 100 line items in
 * payment mode, so one page is the whole session, the same single read the
 * payment-link path makes (entryPaymentLineItems.ts). A page that still says
 * has_more cannot prove one to one and is refused, never guessed at.
 */
export const CART_LINE_ITEMS_READ_LIMIT = 100;

const CART_LINE_TYPE = 'cart_item';
const SERVICE_FEE_LINE_TYPE = 'platform_fee';
/** Stripe drops a metadata key set to '', so "no entry" is written as a word. */
const NO_ENTRY = 'none';

/** The service-fee line's product metadata (the payment-link path tags it the same way). */
export const SERVICE_FEE_LINE_METADATA: Readonly<Record<string, string>> = {
  type: SERVICE_FEE_LINE_TYPE,
};

/** The cart line fields that decide its price (priceCartItems reads exactly these). */
export interface CartLineSnapshotSource {
  id: string;
  dog_id: string;
  /** Decides the class's own fee (MYK9-1931). */
  class_id: string;
  /** A Finish Payment line: the entry whose frozen fee it charges. */
  entry_id?: string | null | undefined;
  /** A new line's junior-handler declaration (MYK9-879). */
  junior_fee_declared?: boolean | null | undefined;
}

/** A cart line at webhook time: its price-determining details and stored fee. */
export interface CartSnapshotItem extends CartLineSnapshotSource {
  entry_fee_cents: number;
}

/** product_data.metadata for one cart line: 6 keys, each value a uuid or a word. */
export function cartLineSnapshotMetadata(item: CartLineSnapshotSource): Record<string, string> {
  return {
    type: CART_LINE_TYPE,
    cart_item_id: item.id,
    dog_id: item.dog_id,
    class_id: item.class_id,
    entry_id: item.entry_id || NO_ENTRY,
    junior_fee_declared: juniorWord(item.junior_fee_declared),
  };
}

/** The session metadata entry that versions the snapshot. */
export function cartSessionSnapshotMetadata(): Record<typeof CART_PRICE_SNAPSHOT_KEY, string> {
  return { [CART_PRICE_SNAPSHOT_KEY]: CART_PRICE_SNAPSHOT_VERSION };
}

/** Only a session stripe-checkout stamped with this version is verified from its line items. */
export function isVersionedCartSession(
  metadata: Record<string, string> | null | undefined
): boolean {
  return metadata?.[CART_PRICE_SNAPSHOT_KEY] === CART_PRICE_SNAPSHOT_VERSION;
}

function juniorWord(declared: boolean | null | undefined): 'true' | 'false' {
  // priceCartItems honors only `=== true`, so null and false price the same.
  return declared === true ? 'true' : 'false';
}

// -- The raw line items, as listLineItems(expand: data.price.product) returns them.

interface RawProduct {
  metadata?: Record<string, string> | null;
  /** Present on Stripe's DeletedProduct, which carries no metadata. */
  deleted?: boolean;
}

interface RawLineItem {
  amount_total?: number | null;
  quantity?: number | null;
  price?: string | { product?: string | RawProduct | null } | null;
}

export interface CartLineItemPage {
  data: RawLineItem[];
  has_more?: boolean | null;
}

export interface CartLineItemClient {
  listLineItems(
    sessionId: string,
    params: { limit: number; expand: string[] }
  ): Promise<CartLineItemPage>;
}

/** One read. A failure propagates: the caller must answer non-2xx, not refuse. */
export async function loadCartPriceSnapshotLineItems(
  client: CartLineItemClient,
  sessionId: string
): Promise<CartLineItemPage> {
  return await client.listLineItems(sessionId, {
    limit: CART_LINE_ITEMS_READ_LIMIT,
    expand: ['data.price.product'],
  });
}

export interface SnapshotLine {
  amountCents: number;
  dog_id: string;
  class_id: string;
  entry_id: string;
  junior_fee_declared: 'true' | 'false';
}

export type CartLineItemsReading =
  | { ok: true; lines: Map<string, SnapshotLine>; serviceFeeCents: number | null }
  | { ok: false; problem: string };

function productMetadata(item: RawLineItem): Record<string, string> | null {
  const price = item.price;
  if (!price || typeof price === 'string') return null;
  const product = price.product;
  if (!product || typeof product === 'string') return null;
  return product.metadata ?? null;
}

/**
 * The cart-specific reader (constraint 5). Unlike readEntryPaymentLineItemFees it
 * keeps every raw line: two lines for one cart item, an untagged line, a second
 * service-fee line or a line that is not exactly one unit at a positive amount
 * makes the reading fail instead of being overwritten or dropped.
 */
export function readCartPriceSnapshotLineItems(page: CartLineItemPage): CartLineItemsReading {
  if (page.has_more === true) {
    return {
      ok: false,
      problem: `the session has more than ${CART_LINE_ITEMS_READ_LIMIT} line items`,
    };
  }
  const lines = new Map<string, SnapshotLine>();
  const counts = new Map<string, number>();
  const fees: number[] = [];
  for (const [index, item] of page.data.entries()) {
    const at = `line item ${index + 1}`;
    const amount = item.amount_total;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return { ok: false, problem: `${at} has no positive amount` };
    }
    if (item.quantity !== 1) {
      return { ok: false, problem: `${at} has quantity ${item.quantity ?? 'unknown'}, not 1` };
    }
    const metadata = productMetadata(item);
    if (metadata?.type === SERVICE_FEE_LINE_TYPE) {
      fees.push(amount);
      continue;
    }
    const id = metadata?.cart_item_id;
    const junior = metadata?.junior_fee_declared;
    if (
      metadata?.type !== CART_LINE_TYPE ||
      !id ||
      !metadata.dog_id ||
      !metadata.class_id ||
      !metadata.entry_id ||
      (junior !== 'true' && junior !== 'false')
    ) {
      return { ok: false, problem: `${at} is neither a tagged cart line nor the service fee` };
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
    lines.set(id, {
      amountCents: amount,
      dog_id: metadata.dog_id,
      class_id: metadata.class_id,
      entry_id: metadata.entry_id,
      junior_fee_declared: junior,
    });
  }
  for (const [id, count] of counts) {
    if (count > 1) return { ok: false, problem: `cart line ${id} has ${count} line items` };
  }
  if (fees.length > 1) {
    return { ok: false, problem: `the session has ${fees.length} service fee lines` };
  }
  return { ok: true, lines, serviceFeeCents: fees[0] ?? null };
}

export type CartChargeVerdict =
  | { ok: true; lineAmounts: Record<string, number> }
  | {
      ok: false;
      /** What the cart is worth by the check that ran, when it could be added up. */
      expectedCents: number | null;
      /** Why the snapshot refused; null for the re-price check. */
      snapshotMismatch: string | null;
      /** refund_requests.detail for the unfulfilled-charge queue. */
      detail: Record<string, unknown>;
    };

function snapshotRefusal(mismatch: string, expectedCents: number | null): CartChargeVerdict {
  return {
    ok: false,
    expectedCents,
    snapshotMismatch: mismatch,
    detail: { price_snapshot_mismatch: mismatch, snapshot_cents: expectedCents },
  };
}

const DETAIL_FIELDS = ['dog_id', 'class_id', 'entry_id', 'junior_fee_declared'] as const;

/**
 * Verify a VERSIONED session's cart against its line items, in this order: the
 * page reads as a cart snapshot; cart lines and line items match one to one;
 * each line's entry details are the ones it was priced for (constraint 1); each
 * stored fee equals its snapshot line (constraint 4); the service-fee line is
 * the stamped rate over the snapshot subtotal, and absent when that is zero;
 * and Stripe captured exactly the line-item sum. The line amounts handed to
 * begin_cart_fulfillment are the snapshot's, so no clock is read here: the
 * day-of tier switching at midnight cannot refuse a versioned session.
 */
export function verifyCartAgainstSnapshot(input: {
  items: readonly CartSnapshotItem[];
  page: CartLineItemPage;
  freshTotalCents: number;
  /** The rates STAMPED on the session at checkout. */
  platformFeeRates: PlatformFeeRates;
}): CartChargeVerdict {
  const reading = readCartPriceSnapshotLineItems(input.page);
  if (!reading.ok) return snapshotRefusal(reading.problem, null);
  const { lines, serviceFeeCents } = reading;

  let subtotal = 0;
  for (const line of lines.values()) subtotal += line.amountCents;
  const dueFee = calculatePlatformFeeCents(subtotal, input.platformFeeRates);
  const expected = subtotal + dueFee;

  if (input.items.length === 0 || lines.size === 0) {
    return snapshotRefusal('the session or the cart has no cart lines', expected);
  }
  const cartIds = new Set(input.items.map(item => item.id));
  if (cartIds.size !== input.items.length) {
    return snapshotRefusal('the cart lists one cart line twice', expected);
  }
  for (const id of lines.keys()) {
    if (!cartIds.has(id))
      return snapshotRefusal(`line item for ${id} is not on the cart`, expected);
  }
  for (const item of input.items) {
    const line = lines.get(item.id);
    if (!line) return snapshotRefusal(`cart line ${item.id} has no line item`, expected);
    const now = cartLineSnapshotMetadata(item);
    for (const field of DETAIL_FIELDS) {
      if (now[field] !== line[field]) {
        return snapshotRefusal(
          `cart line ${item.id} ${field} changed from ${line[field]} to ${now[field]} after checkout opened`,
          expected
        );
      }
    }
    if (item.entry_fee_cents !== line.amountCents) {
      return snapshotRefusal(
        `cart line ${item.id} is stored at ${item.entry_fee_cents} cents but was sold at ${line.amountCents}`,
        expected
      );
    }
  }

  if (dueFee === 0 && serviceFeeCents !== null) {
    return snapshotRefusal(
      `the session has a ${serviceFeeCents} cent service fee line but no service fee is due`,
      expected
    );
  }
  if (dueFee > 0 && serviceFeeCents === null) {
    return snapshotRefusal(
      `a ${dueFee} cent service fee is due but there is no service fee line`,
      expected
    );
  }
  if (dueFee > 0 && serviceFeeCents !== dueFee) {
    return snapshotRefusal(
      `the service fee line is ${serviceFeeCents} cents but the stamped rate gives ${dueFee}`,
      expected
    );
  }
  const lineItemSum = subtotal + (serviceFeeCents ?? 0);
  if (lineItemSum !== input.freshTotalCents) {
    return snapshotRefusal(
      `Stripe captured ${input.freshTotalCents} cents but the line items add up to ${lineItemSum}`,
      expected
    );
  }

  const lineAmounts: Record<string, number> = {};
  for (const item of input.items) lineAmounts[item.id] = lines.get(item.id)!.amountCents;
  return { ok: true, lineAmounts };
}

export interface PaidCartVerifyDeps {
  /** The session's line items; a failed read throws (the webhook answers 5xx). */
  loadLineItems: () => Promise<CartLineItemPage>;
  /** The pre-snapshot check: price the cart now and return what it is worth. */
  repriceTotal: () => Promise<{ expectedCents: number; lineAmounts: Record<string, number> }>;
}

/**
 * The one decision between the two checks. A versioned session is verified from
 * its line items and never re-priced; an unversioned one (opened before this
 * shipped, or reused by resolveCheckoutSession) keeps the re-price check and is
 * never refused as "snapshot missing" (constraint 2).
 */
export async function verifyPaidCartCharge(
  deps: PaidCartVerifyDeps,
  input: {
    sessionMetadata: Record<string, string> | null | undefined;
    items: readonly CartSnapshotItem[];
    freshTotalCents: number;
    platformFeeRates: PlatformFeeRates;
  }
): Promise<CartChargeVerdict> {
  if (isVersionedCartSession(input.sessionMetadata)) {
    return verifyCartAgainstSnapshot({
      items: input.items,
      page: await deps.loadLineItems(),
      freshTotalCents: input.freshTotalCents,
      platformFeeRates: input.platformFeeRates,
    });
  }
  const repriced = await deps.repriceTotal();
  if (repriced.expectedCents === input.freshTotalCents) {
    return { ok: true, lineAmounts: repriced.lineAmounts };
  }
  return {
    ok: false,
    expectedCents: repriced.expectedCents,
    snapshotMismatch: null,
    detail: { authoritative_cents: repriced.expectedCents },
  };
}
