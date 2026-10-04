import { supabase } from '../supabaseClient';

/** The name half of a confirmed judge assignment, split as `people` stores it. */
export interface JudgeNameParts {
  personId: string;
  firstName: string | null;
  lastName: string | null;
}

type ShowJudgeRows = NonNullable<
  Awaited<ReturnType<typeof supabase.rpc<'get_show_judges'>>>['data']
>;

async function callGetShowJudges(showId: string): Promise<ShowJudgeRows | null> {
  try {
    const result = await supabase.rpc('get_show_judges', { p_show_id: showId });
    // A failed call is NOT "this show has no judges": the caller must be able to tell them
    // apart, or a transient RPC failure overwrites a correct cached name with `Judge TBD`.
    if (result.error) return null;
    return result.data ?? null;
  } catch {
    return null;
  }
}

/** One confirmed judge assignment, as the public landing lists a judge against a trial. */
export interface ConfirmedJudgeAssignment {
  personId: string;
  firstName: string | null;
  lastName: string | null;
  trialId: string | null;
  /** Class-level edits (`replaceClassAssignment`) write `class_id` with a null `trial_id`. */
  classId: string | null;
}

/**
 * Every confirmed judge assignment for one show (anon-callable: get_show_judges is the
 * public judge-name path, see above). `null` means the read failed, which a caller must not
 * confuse with a show that has no judges.
 */
export async function fetchShowConfirmedJudgeAssignments(
  showId: string
): Promise<ConfirmedJudgeAssignment[] | null> {
  const data = await callGetShowJudges(showId);
  if (!data) return null;
  return data
    .filter(row => row.status === 'confirmed' && (row.first_name || row.last_name))
    .map(row => ({
      personId: row.person_id,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
      trialId: row.trial_id ?? null,
      classId: row.class_id ?? null,
    }));
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
export async function fetchShowJudgeNameParts(
  showId: string
): Promise<Map<string, JudgeNameParts> | null> {
  const data = await callGetShowJudges(showId);
  if (!data) return null;

  const byClass = new Map<string, JudgeNameParts>();
  // The RPC has no ORDER BY, so a class with two confirmed assignments would otherwise resolve
  // to whichever row arrived first. Pick the lowest assignment_id — stable across calls and the
  // same tie-break the embed uses — and take the id AND the name from that one row.
  const chosen = new Map<string, string>();

  // No cast: the get_show_judges row type comes from the generated Database types, so a change
  // to the function's RETURNS TABLE surfaces here as a type error rather than at runtime.
  for (const row of data) {
    if (row.status !== 'confirmed') continue;
    if (!row.class_id) continue;
    if (!row.first_name && !row.last_name) continue;
    const incumbent = chosen.get(row.class_id);
    if (incumbent !== undefined && incumbent <= row.assignment_id) continue;
    chosen.set(row.class_id, row.assignment_id);
    byClass.set(row.class_id, {
      personId: row.person_id,
      firstName: row.first_name ?? null,
      lastName: row.last_name ?? null,
    });
  }
  return byClass;
}

/** `fetchShowJudgeNameParts` for callers that degrade to "no judge" rather than branching. */
export async function fetchJudgeNamePartsByClass(
  showId: string
): Promise<Map<string, JudgeNameParts>> {
  return (await fetchShowJudgeNameParts(showId)) ?? new Map<string, JudgeNameParts>();
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
