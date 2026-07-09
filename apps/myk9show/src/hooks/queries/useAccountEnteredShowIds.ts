import { useQuery } from '@tanstack/react-query';
import { getUserEntries } from '@/services/database/entries';

/**
 * exhibitor-count-integrity (Shows page "Entered as exhibitor" tab).
 *
 * BrowseShowsPage decides "entered" membership from the legacy per-show
 * `entryStore`, which is empty until the exhibitor has opened that specific
 * show, so on a fresh session the tab count reads 0 while My Shows correctly
 * shows every entry. This hook supplies the authoritative set of entered
 * show ids from the SAME account-level, offline-aware source My Shows uses
 * (`getUserEntries`, the `account-entry-sync` capability), so the tab can be
 * corrected without swapping the shared `entryStore` that many other surfaces
 * depend on.
 *
 * Returns show ids only; the caller stamps them with its own user id so the
 * existing membership filters (which key on `registrationData.handlerId`)
 * match regardless of which user-identity notion the page uses.
 */
export function useAccountEnteredShowIds(personId: string | null | undefined): string[] {
  const { data } = useQuery({
    queryKey: ['browse-shows', 'account-entered-show-ids', personId],
    queryFn: async () => {
      if (!personId) return [];
      const { data: rows } = await getUserEntries(personId);
      const ids = new Set<string>();
      for (const row of rows ?? []) {
        const showId = (row as { show_id?: string }).show_id;
        if (showId) ids.add(showId);
      }
      return [...ids];
    },
    enabled: !!personId,
    staleTime: 60_000,
  });

  return data ?? [];
}
