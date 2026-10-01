import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * MYK9-879: the ids of this show's entries whose junior handler fee was charged
 * on the exhibitor's own declaration at online checkout, so the secretary can see
 * after the fact which entries paid it and call out misuse.
 *
 * ONLINE-ONLY by design, like `useEmailStatus` beside it: this is a back-office
 * audit marker, not show-day data, so it does not ride the replica. A failed or
 * paused read shows no marker (it never claims "not declared" as a fact: the
 * badge is only ever added, and the entry's fee is still shown beside it).
 *
 * The set is SHOW-WIDE, not limited to the visible rows, on purpose: the declaration
 * lives on the entry that was PAID, and after a move-up the row on screen is the
 * money-neutral destination. The list reads each row through its money root
 * (`entry.moneyRootEntryId ?? entry.id`), so the root's id must be in this set
 * even when the root is filtered out of the list (e.g. a class filter).
 *
 * `entries.junior_fee_declared` is written only by the checkout webhook; row
 * access is the entries RLS the secretary already has. It reads no date of birth.
 */
/** Supabase caps a response at 1,000 rows (supabase/config.toml), so read in pages. */
export const JUNIOR_DECLARED_PAGE_SIZE = 1000;

export function useJuniorDeclaredEntryIds(showId: string | undefined) {
  return useQuery({
    queryKey: ['junior-declared-entries', showId],
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const ids = new Set<string>();
      // Every page, in a deterministic order (id), until a short page: a single
      // read silently drops ids past the cap, and with them badges, including the
      // money roots a moved-up destination resolves to.
      for (let from = 0; ; from += JUNIOR_DECLARED_PAGE_SIZE) {
        const { data, error } = await supabase
          .from('entries')
          // A named column, never '*': entries is column-allowlisted (LESSONS).
          .select('id')
          .eq('show_id', showId as string)
          .eq('junior_fee_declared', true)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, from + JUNIOR_DECLARED_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        const page = data ?? [];
        for (const row of page) ids.add(row.id);
        if (page.length < JUNIOR_DECLARED_PAGE_SIZE) break;
      }
      return ids;
    },
    enabled: !!showId,
    staleTime: 30_000,
  });
}
