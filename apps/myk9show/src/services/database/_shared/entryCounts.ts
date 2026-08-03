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

/**
 * Per-class totals for a PUBLIC surface, counted independently of the viewer.
 *
 * `fetchEntryCountsByClassIds` above runs under the caller's session, which is
 * correct for secretary-scoped surfaces and wrong for a venue wall display: the
 * two SELECT policies on `entries` differ deliberately, so anon counts a class
 * show-wide while a signed-in exhibitor counts only their own dogs. The board
 * then renders "3 / 2" — a plausible wrong number, which is worse than the
 * "3 / 0" this issue started as.
 *
 * `tv_class_entry_counts` is SECURITY DEFINER and re-derives the same show
 * predicate as the anon TV policy, so the board depends on the show and never on
 * who is looking (MYK9-65, migration 20260803130000).
 *
 * One round trip for the whole board rather than a `head` request per class:
 * that also removes the failure mode where a single class's count rejecting
 * collapsed every total through `Promise.all`.
 *
 * Classes with no entries are absent from the RPC result — the server will not
 * echo back a caller-supplied id list — so they are filled in as 0 here, keeping
 * the "every requested id is present" contract callers already rely on.
 */
export async function fetchPublicEntryCountsByShow(
  showId: string,
  classIds: readonly string[],
  operation: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('tv_class_entry_counts', {
    p_show_id: showId,
  });

  if (error) throw createDatabaseError(error, 'entry', operation);

  const counted = new Map((data ?? []).map(row => [row.class_id, row.entry_count]));
  return new Map(classIds.map(classId => [classId, counted.get(classId) ?? 0]));
}
