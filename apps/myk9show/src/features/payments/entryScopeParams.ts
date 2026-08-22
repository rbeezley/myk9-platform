/**
 * Query-param vocabulary for the two order-scoped deep links.
 *
 * `buildFinishPaymentHref` (→ `/cart`) and `buildEntryReceiptHref` (→ My Shows)
 * share the show/entry scope; the receipt additionally carries `orderId` for
 * its independent exact-order query. Producers and readers import these names
 * so the vocabulary cannot drift silently.
 *
 * Scope note: other surfaces read a `showId` query param for unrelated routes
 * (messages, volunteer scheduling, the show wizard). Those are a different
 * vocabulary that happens to share a word — they are not readers of these
 * links and must NOT be migrated onto these constants.
 */
export const ENTRY_SCOPE_SHOW_PARAM = 'showId';
export const ENTRY_SCOPE_ENTRIES_PARAM = 'entryIds';
/** Stripe order identity used only by the receipt's exact keyed lookup. */
export const ENTRY_SCOPE_ORDER_PARAM = 'orderId';
