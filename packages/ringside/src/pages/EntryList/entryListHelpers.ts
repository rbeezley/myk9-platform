/**
 * Small pure helpers for the entry list.
 *
 * Originally `CombinedEntryList.helpers.ts` in apps/myk9q, then
 * `entryListHelpers.ts` here. Renamed when MYK9-260 collapsed the
 * combined A/B page into `EntryListPage`: the combined-specific pieces
 * (`compareEntries`, `PRINT_DIALOG_TITLES`, `useEntryHandlers`,
 * `getScoresheetNavigationRoute`) went with that page, and what remains is
 * shared by both modes, so the old name had stopped being true.
 *
 * The section-aware sort did NOT disappear with `compareEntries` -- it moved
 * into `useEntryListFilters` as the `'section-armband'` comparator, which is
 * how both modes now reach it.
 */

/**
 * Parse time limits from string format. Returns the parsed integer,
 * or `undefined` for empty / non-numeric input.
 */
export function parseTimeLimit(timeStr?: string): number | undefined {
  if (!timeStr) return undefined;
  const num = parseInt(timeStr, 10);
  if (!isNaN(num)) return num;
  return undefined;
}
