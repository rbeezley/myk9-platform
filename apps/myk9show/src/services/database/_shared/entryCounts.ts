import { supabase, createDatabaseError } from '../supabaseClient';

/**
 * Canonical per-class entry totals, counted from `entries` rows (MYK9-65).
 *
 * `classes.total_entries_count` is a denormalized snapshot with no maintaining
 * trigger — every class in the database carries 0 — while `scored_count` IS
 * advanced by scoring. Any surface that mixes the two publishes nonsense such
 * as "3 / 0", which is exactly how this defect kept resurfacing on a new
 * surface after each fix. Entry rows are the only source of truth for a total,
 * so every PostgREST read path counts them here.
 *
 * Counted exactly, one class at a time, rather than fetching every row and
 * grouping client-side: PostgREST caps a row fetch at the server's max-rows
 * limit, so grouping would silently undercount a large show instead of
 * failing loudly. A wrong total that looks plausible is the failure mode this
 * whole issue is about.
 *
 * Soft-deleted entries are excluded so the total agrees with the result set a
 * deep link into the class actually returns.
 *
 * Throws a DatabaseError if any count fails; callers that must degrade rather
 * than fail (public/offline surfaces) catch and render "unavailable".
 */
export async function fetchEntryCountsByClassIds(
  classIds: readonly string[],
  operation: string
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    classIds.map(async classId => {
      const { count, error } = await supabase
        .from('entries')
        .select('class_id', { count: 'exact', head: true })
        .eq('class_id', classId)
        .is('deleted_at', null);

      if (error) throw createDatabaseError(error, 'entry', operation);
      return [classId, count ?? 0] as const;
    })
  );

  return new Map(counts);
}
