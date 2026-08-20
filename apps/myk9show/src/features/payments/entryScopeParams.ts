/**
 * Query-param vocabulary for the two order-scoped deep links.
 *
 * `buildFinishPaymentHref` (→ `/cart`) and `buildEntryReceiptHref` (→ My Shows)
 * are mirror images; `CartPage` and `parseEntryScope` are their readers. All
 * four import the names from here, so a rename cannot reach one half of a
 * producer/reader pair without reaching the other.
 *
 * Scope note: other surfaces read a `showId` query param for unrelated routes
 * (messages, volunteer scheduling, the show wizard). Those are a different
 * vocabulary that happens to share a word — they are not readers of these
 * links and must NOT be migrated onto these constants.
 */
export const ENTRY_SCOPE_SHOW_PARAM = 'showId';
export const ENTRY_SCOPE_ENTRIES_PARAM = 'entryIds';
