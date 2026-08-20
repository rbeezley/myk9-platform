/**
 * Query-param vocabulary shared by the two order-scoped deep links.
 *
 * `buildFinishPaymentHref` (→ `/cart`) and `buildEntryReceiptHref` (→ My Shows)
 * are mirror images, and `CartPage` / `parseEntryScope` read what they write.
 * The names live here rather than in either producer so no site re-types the
 * strings and no rename can reach one half of the pair but not the other.
 */
export const ENTRY_SCOPE_SHOW_PARAM = 'showId';
export const ENTRY_SCOPE_ENTRIES_PARAM = 'entryIds';
