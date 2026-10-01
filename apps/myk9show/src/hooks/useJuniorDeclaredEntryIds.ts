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
 * `entries.junior_fee_declared` is written only by the checkout webhook; row
 * access is the entries RLS the secretary already has. It reads no date of birth.
 */
export function useJuniorDeclaredEntryIds(showId: string | undefined) {
  return useQuery({
    queryKey: ['junior-declared-entries', showId],
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const { data, error } = await supabase
        .from('entries')
        // A named column, never '*': entries is column-allowlisted (LESSONS).
        .select('id')
        .eq('show_id', showId as string)
        .eq('junior_fee_declared', true)
        .is('deleted_at', null);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map(row => row.id));
    },
    enabled: !!showId,
    staleTime: 30_000,
  });
}
