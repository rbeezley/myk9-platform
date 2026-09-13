import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

export interface ShowJudge {
  id: string;
  name: string;
}

/**
 * MYK9-474: reads through the get_show_judges RPC, NOT a `people!inner(...)` embed.
 *
 * /shows/:id is a public route with no auth, so this hook runs as `anon` for a signed-out
 * visitor. The previous query embedded `people!inner(id, first_name, last_name)`: `people` has
 * column-level anon grants so the embed parsed, but no `people` policy admits anon, and an INNER
 * join on zero visible rows drops the judge_assignments row entirely — so this returned [] for
 * every public visitor, and the show-detail judge roster was always empty.
 *
 * The RPC is SECURITY DEFINER with the same show-status gate as get_show_officials and returns no
 * email column, so it publishes names without admitting anon rows on `people`. See the migration
 * 20260912211500 header for why that is preferred over an anon-visible people policy.
 */
async function fetchShowJudges(showId: string): Promise<ShowJudge[]> {
  const { data, error } = await supabase.rpc('get_show_judges', { p_show_id: showId });

  if (error) throw error;

  const seen = new Set<string>();
  const judges: ShowJudge[] = [];
  // No cast: the row type comes from the generated Database types.
  for (const row of data ?? []) {
    const personId = row.person_id;
    if (!personId || seen.has(personId)) continue;
    seen.add(personId);
    judges.push({
      id: personId,
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unknown Judge',
    });
  }

  return judges.sort((a, b) => a.name.localeCompare(b.name));
}

export function useShowJudges(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.showJudges(showId || ''),
    queryFn: () => fetchShowJudges(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}
