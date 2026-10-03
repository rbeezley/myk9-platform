/**
 * What a Finish Payment link's entries came to on /cart (MYK9-873).
 *
 * A payment link names specific entries. Between the email and the click some
 * may have been paid, withdrawn or closed to payment, and the cart the exhibitor
 * lands on may already hold other lines. A load settles the cart ONCE (live
 * entry reconciliation, closed-class removal, and a rebuild from the link when
 * that leaves the cart with no lines) and stores only the link's FACTS: its ids
 * and which of them are still payable. The outcome is one pure function of those
 * facts and the LIVE cart, derived on every render, so it can never go stale
 * when the exhibitor removes a line or clears the cart.
 *
 * The rebuild rule keeps every notice actionable (INTENT: no dead ends): a load
 * always refills an EMPTY cart with the link's still-payable entries, and the
 * notice on an empty cart offers that same reload. A cart that already holds
 * lines is never backfilled.
 */
import type {
  CartItemWithDetails,
  DroppedCartItem,
  PaymentLinkFacts,
  PaymentLinkOutcome,
  PaymentLinkOutcomeKind,
} from './cartStore.types';
import {
  RECOVERY_FAILED_MESSAGE,
  recoverCartItemsFromEntryIds,
  type RecoverableEntryRow,
  type RecoveryOutcome,
} from './cartStore.recovery';

/**
 * The identity of a payment link: its entry ids, de-duplicated and sorted. Entry
 * ids are unique across shows, so this names the link without its show, and the
 * notice can render on /cart before (or without) any cart loading.
 */
export function paymentLinkKey(entryIds: readonly string[]): string | null {
  const ids = [...new Set(entryIds.filter(Boolean))].sort();
  return ids.length > 0 ? ids.join(',') : null;
}

/**
 * The ONE description of a payment link against the final cart.
 *
 * @param linkIds the entry ids the link names.
 * @param payableIds the linked entries that are still payable, or null when the
 *   lookup or the rebuild failed.
 * @param finalCartEntryIds one value per line of the FINAL cart (after every
 *   reconciliation): the entry that line settles, or null for a new line.
 */
export function describePaymentLinkOutcome(
  linkIds: readonly string[],
  payableIds: ReadonlySet<string> | null,
  finalCartEntryIds: ReadonlyArray<string | null>
): PaymentLinkOutcome {
  const requested = [...new Set(linkIds.filter(Boolean))];
  if (payableIds === null) {
    return { kind: 'failed', requested: requested.length, unavailable: 0, stillUnpaid: 0 };
  }
  const inCart = new Set(finalCartEntryIds.filter((id): id is string => Boolean(id)));
  const missing = requested.filter(id => !inCart.has(id));
  const stillUnpaid = missing.filter(id => payableIds.has(id)).length;
  const kind: PaymentLinkOutcomeKind =
    finalCartEntryIds.length === 0
      ? 'none-left'
      : missing.length === 0
        ? 'all-present'
        : 'some-missing';
  return {
    kind,
    requested: requested.length,
    unavailable: missing.length - stillUnpaid,
    stillUnpaid,
  };
}

/**
 * The outcome of stored link facts against the LIVE cart lines. Derived on every
 * render, never stored, so a removed line or a cleared cart changes it at once.
 */
export function derivePaymentLinkOutcome(
  facts: PaymentLinkFacts,
  cartItems: ReadonlyArray<Pick<CartItemWithDetails, 'entry_id'>>
): PaymentLinkOutcome {
  return describePaymentLinkOutcome(
    facts.linkIds,
    facts.payableIds ? new Set(facts.payableIds) : null,
    cartItems.map(item => item.entry_id ?? null)
  );
}

/**
 * The store fields a payment-link load sets: its facts, and for a failure the
 * cart's retryable error (a failure derives to `failed`, which shows no notice).
 */
export function paymentLinkFactsState(
  linkIds: readonly string[],
  payableIds: string[] | null
): { paymentLinkFacts: PaymentLinkFacts | null; error?: string } {
  const linkKey = paymentLinkKey(linkIds);
  const paymentLinkFacts = linkKey ? { linkKey, linkIds: [...linkIds], payableIds } : null;
  return payableIds === null
    ? { paymentLinkFacts, error: RECOVERY_FAILED_MESSAGE }
    : { paymentLinkFacts };
}

/** Live-entry reconciliation plus closed-class removal, as `loadActiveCart` runs them. */
export type SettleCartLines = (
  items: CartItemWithDetails[]
) => Promise<{ items: CartItemWithDetails[]; dropped: DroppedCartItem[] }>;

/**
 * Settle a cart opened from a payment link, and return the link's payable ids
 * (null on a failed lookup or rebuild) for the store to keep as facts.
 *
 * `payable` is the link lookup (`findRecoverableEntries`); a failed lookup comes
 * back null without touching the cart beyond the usual settle.
 */
export async function settlePaymentLinkCart({
  cartId,
  showId,
  exhibitorId,
  linkIds,
  items,
  payable,
  settle,
}: {
  cartId: string;
  showId: string;
  exhibitorId: string;
  linkIds: string[];
  items: CartItemWithDetails[];
  payable: RecoveryOutcome<RecoverableEntryRow[]>;
  settle: SettleCartLines;
}): Promise<{
  items: CartItemWithDetails[];
  dropped: DroppedCartItem[];
  payableIds: string[] | null;
}> {
  let settled = await settle(items);
  const closedEntryIds = closedLineEntryIds(items, settled);

  if (!payable.ok) return { ...settled, payableIds: null };

  // A line removed for a closed class cannot be paid here either; its own
  // notice says why, and it must not be rebuilt only to be removed again.
  let payableEntries = payable.value.filter(entry => !closedEntryIds.has(entry.id));

  if (settled.items.length === 0 && payableEntries.length > 0) {
    const rebuilt = await recoverCartItemsFromEntryIds({
      cartId,
      showId,
      exhibitorId,
      entryIds: linkIds,
      recoverableEntries: payableEntries,
    });
    if (!rebuilt.ok) return { ...settled, payableIds: null };
    const again = await settle(rebuilt.value);
    const closedAgain = closedLineEntryIds(rebuilt.value, again);
    payableEntries = payableEntries.filter(entry => !closedAgain.has(entry.id));
    settled = { items: again.items, dropped: [...settled.dropped, ...again.dropped] };
  }

  return { ...settled, payableIds: payableEntries.map(entry => entry.id) };
}

/** The entry ids of the lines the settle removed for a closed class. */
function closedLineEntryIds(
  before: CartItemWithDetails[],
  after: { dropped: DroppedCartItem[] }
): Set<string> {
  const droppedIds = new Set(after.dropped.map(drop => drop.itemId));
  return new Set(
    before
      .filter(item => droppedIds.has(item.id) && item.entry_id)
      .map(item => item.entry_id as string)
  );
}
