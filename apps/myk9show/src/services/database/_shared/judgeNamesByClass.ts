import { supabase } from '../supabaseClient';

/** The name half of a confirmed judge assignment, split as `people` stores it. */
export interface JudgeNameParts {
  personId: string;
  firstName: string | null;
  lastName: string | null;
}

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
 * The RPC returns every assignment row regardless of status; only `confirmed` rows name the
 * judge, matching `emergency_packet_input`, `judge_day_summary` and the rebuilt stats views.
 * An invited, declined or cancelled assignment must not put a name on a running order.
 *
 * Degrades to an empty Map on failure: a judge-name error must not take a running order off the
 * board or block an exhibitor's check-in.
 */
export async function fetchJudgeNamePartsByClass(
  showId: string
): Promise<Map<string, JudgeNameParts>> {
  const byClass = new Map<string, JudgeNameParts>();
  const { data, error } = await supabase.rpc('get_show_judges', { p_show_id: showId });
  if (error || !data) return byClass;

  // No cast: the get_show_judges row type comes from the generated Database types, so a change
  // to the function's RETURNS TABLE surfaces here as a type error rather than at runtime.
  for (const row of data) {
    if (row.status !== 'confirmed') continue;
    if (!row.class_id || byClass.has(row.class_id)) continue;
    if (!row.first_name && !row.last_name) continue;
    byClass.set(row.class_id, {
      personId: row.person_id,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
    });
  }
  return byClass;
}

/** `fetchJudgeNamePartsByClass` flattened to the display string. */
export async function fetchJudgeNamesByClass(showId: string): Promise<Map<string, string>> {
  const parts = await fetchJudgeNamePartsByClass(showId);
  const byClass = new Map<string, string>();
  for (const [classId, judge] of parts) {
    const name = `${judge.firstName ?? ''} ${judge.lastName ?? ''}`.trim();
    if (name) byClass.set(classId, name);
  }
  return byClass;
}
