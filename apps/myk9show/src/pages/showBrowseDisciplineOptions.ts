/**
 * Discipline and entry-status vocabularies shared by `useBrowseShowsFilters.ts`
 * (which applies them) and `showBrowseFilterFields.ts` (which turns them into
 * `ListFilterField` options for the list-toolkit filter bar, MYK9-798).
 *
 * Kept out of `useBrowseShowsFilters.ts` itself: `BrowseShowsPage.test.tsx`
 * replaces that whole module with `vi.mock`, which would silently drop these
 * exports for every other importer.
 */

/** Discipline to show type mapping. */
export const DISCIPLINE_MAP: Record<string, string> = {
  agility: 'Agility',
  scent_work: 'Scent Work',
  rally: 'Rally',
  obedience: 'Obedience',
};

/** Entry-window buckets the Entry Status filter recognizes. */
export const ENTRY_STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'closing_soon', label: 'Closing Soon' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'closed', label: 'Closed' },
];
