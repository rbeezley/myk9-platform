/**
 * One state contract for how a cart line will actually be fulfilled.
 *
 * MYK9-122: the cart used to render every line identically and total all of
 * them, while `splitCartItemsByJudgeDayCapacity` — the rule that actually
 * decides what gets charged — only ran inside the checkout click handler. A
 * full class therefore looked like an ordinary payable entry, moved the total,
 * and then vanished from the cart once checkout routed it to the wait list.
 *
 * This module hoists that same decision into a derived view so the cart, its
 * totals, and checkout are all driven by one rule. It adds no new logic: the
 * split itself still comes from `splitCartItemsByJudgeDayCapacity`.
 */

import type { CartItemWithDetails } from '@/store/cartStore';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { splitCartItemsByJudgeDayCapacity } from './cartCapacitySplit';

export type CartItemFulfillment =
  /** Will be charged and confirmed at checkout. */
  | 'payable'
  /** Class is full but accepts a wait list — recorded as a request pending server confirmation. */
  | 'waitlist'
  /** Class is full and refuses a wait list — cannot proceed until it is removed. */
  | 'blocked';

export interface CartFulfillmentView {
  /**
   * False until judge-day capacity has resolved. While false no line has been
   * judged against real availability, so callers must not present the payable
   * total as final — gate checkout on this rather than guessing.
   */
  capacityKnown: boolean;
  fulfillmentByItemId: Record<string, CartItemFulfillment>;
  payableItems: CartItemWithDetails[];
  waitlistItems: CartItemWithDetails[];
  blockedItems: CartItemWithDetails[];
  /** Entry fees that will be charged at checkout. */
  payableSubtotalCents: number;
  /** What the wait-list requests would cost if a spot is later offered. Never charged now. */
  waitlistSubtotalCents: number;
}

const EMPTY_VIEW: Omit<CartFulfillmentView, 'capacityKnown'> = {
  fulfillmentByItemId: {},
  payableItems: [],
  waitlistItems: [],
  blockedItems: [],
  payableSubtotalCents: 0,
  waitlistSubtotalCents: 0,
};

function sumFees(items: CartItemWithDetails[]): number {
  return items.reduce((total, item) => total + item.entry_fee_cents, 0);
}

/**
 * Derive per-line fulfillment and the payable total from cart items.
 *
 * Pass `judgeDays: null` while capacity is still loading or failed to load.
 * Lines stay payable in that state (demoting them on a guess would be its own
 * false claim), and `capacityKnown` is false so the caller can hold checkout.
 */
export function buildCartFulfillmentView(
  items: CartItemWithDetails[],
  judgeDays: JudgeDayCapacity[] | null,
  fullClassIds: readonly string[] = []
): CartFulfillmentView {
  if (items.length === 0) {
    return { capacityKnown: judgeDays !== null, ...EMPTY_VIEW };
  }

  if (judgeDays === null) {
    const fulfillmentByItemId: Record<string, CartItemFulfillment> = {};
    for (const item of items) {
      fulfillmentByItemId[item.id] = 'payable';
    }
    return {
      capacityKnown: false,
      fulfillmentByItemId,
      payableItems: items,
      waitlistItems: [],
      blockedItems: [],
      payableSubtotalCents: sumFees(items),
      waitlistSubtotalCents: 0,
    };
  }

  const decision = splitCartItemsByJudgeDayCapacity(items, judgeDays, fullClassIds);
  const blockedItemIds = new Set(decision.blockedItems.map(item => item.id));

  const fulfillmentByItemId: Record<string, CartItemFulfillment> = {};
  const payableItems: CartItemWithDetails[] = [];
  const waitlistItems: CartItemWithDetails[] = [];

  for (const item of items) {
    if (blockedItemIds.has(item.id)) {
      fulfillmentByItemId[item.id] = 'blocked';
    } else if (decision.waitlistItemIds.has(item.id)) {
      fulfillmentByItemId[item.id] = 'waitlist';
      waitlistItems.push(item);
    } else {
      fulfillmentByItemId[item.id] = 'payable';
      payableItems.push(item);
    }
  }

  return {
    capacityKnown: true,
    fulfillmentByItemId,
    payableItems,
    waitlistItems,
    blockedItems: decision.blockedItems,
    payableSubtotalCents: sumFees(payableItems),
    waitlistSubtotalCents: sumFees(waitlistItems),
  };
}
