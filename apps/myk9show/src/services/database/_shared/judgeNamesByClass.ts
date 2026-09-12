import { supabase } from '../supabaseClient';

/**
 * Judge name per class for one show, via the get_show_judges RPC.
 *
 * NOT a `judge_assignments(people(...))` embed. `people_select` admits only the caller's own
 * row and show managers, so for an exhibitor (or an anonymous TV viewer) the embed parses and
 * then resolves to `"people": null` on every row (MYK9-474). The RPC is SECURITY DEFINER with the
 * same show-status gate as get_show_officials and returns no email column, so it publishes names
 * without admitting rows on `people`.
 *
 * This is the ONLY judge-name source a class has: `classes.judge_name` was dropped
 * (MYK9-479), so a class with no confirmed assignment has no name and is absent from the map.
 *
 * Degrades to an empty Map on failure: a judge-name error must not take a running order off the
 * board or block an exhibitor's check-in.
 */
export async function fetchJudgeNamesByClass(showId: string): Promise<Map<string, string>> {
  const byClass = new Map<string, string>();
  const { data, error } = await supabase.rpc('get_show_judges', { p_show_id: showId });
  if (error || !data) return byClass;

  // No cast: the get_show_judges row type comes from the generated Database types, so a change
  // to the function's RETURNS TABLE surfaces here as a type error rather than at runtime.
  for (const row of data) {
    if (!row.class_id || byClass.has(row.class_id)) continue;
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    if (name) byClass.set(row.class_id, name);
  }
  return byClass;
}
