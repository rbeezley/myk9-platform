/**
 * Deep-link from a settled payment row to the entries that payment covers.
 *
 * The mirror image of `buildFinishPaymentHref`: same `showId` + `entryIds`
 * query vocabulary, pointed at My Shows instead of the cart. My Shows reads
 * both params (see `parseEntryScope`) and narrows its list to that order, so
 * "Receipt" lands on the entries whose printable receipt the exhibitor came
 * for rather than on every entry they have ever made.
 *
 * `entryIds` is the precise scope — one order's entry rows. `showId` is the
 * fallback the reader uses when none of those ids are on screen (a row still
 * replicating, or an entry since regrouped), which narrows to the right show
 * rather than giving up and showing everything.
 *
 * The param NAMES are exported so producer and reader cannot drift; import
 * these constants rather than re-typing the strings.
 */
export const ENTRY_SCOPE_SHOW_PARAM = 'showId';
export const ENTRY_SCOPE_ENTRIES_PARAM = 'entryIds';

/** Route the scoped receipt link targets — My Shows (a.k.a. My Entries). */
export const MY_SHOWS_PATH = '/exhibitor/entries';

export function buildEntryReceiptHref(showId: string | null, entryIds: string[]): string {
  const params = new URLSearchParams();
  if (showId) params.set(ENTRY_SCOPE_SHOW_PARAM, showId);
  // An empty `entryIds=` would parse to no ids anyway; omit it so an
  // order with no linked entries produces a clean show-scoped URL rather
  // than a trailing empty param the reader has to special-case.
  if (entryIds.length > 0) params.set(ENTRY_SCOPE_ENTRIES_PARAM, entryIds.join(','));
  const query = params.toString();
  return query ? `${MY_SHOWS_PATH}?${query}` : MY_SHOWS_PATH;
}
