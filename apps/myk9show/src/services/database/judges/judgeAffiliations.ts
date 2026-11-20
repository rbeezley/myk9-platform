import { createDatabaseError, supabase } from '../supabaseClient';
import {
  liveShowJudges,
  type LiveJudgeAssignmentRow,
  type LiveJudgeTrialRow,
} from './liveShowJudges';

/** One judge the premium prints, with the affiliation typed on their person record (MYK9-2292). */
export interface ShowJudgeAffiliation {
  id: string;
  name: string;
  affiliation: string | null;
}

/** The premium checklist's affiliation read; prefix-invalidated by every write that can change it. */
export { PREMIUM_JUDGE_AFFILIATIONS_KEY } from './judgeAffiliationKeys';

const PAGE_SIZE = 1000;

async function fetchAssignments(showId: string): Promise<LiveJudgeAssignmentRow[]> {
  const rows: LiveJudgeAssignmentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('judge_assignments')
      .select(
        `trial_id, class_id, status,
         person:people!judge_assignments_person_id_fkey(id, first_name, last_name, judge_affiliation)`
      )
      .eq('show_id', showId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw createDatabaseError(error, 'judge_assignments', 'select_judge_affiliations');
    const page = (data ?? []) as unknown as LiveJudgeAssignmentRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * The judges the ASCA premium prints, once each, with their affiliation, for the premium
 * checklist (MYK9-2292). An online read of the person record, where the affiliation is typed;
 * the checklist only warns, so a failed read leaves the item out rather than reporting every
 * judge as empty.
 */
export async function fetchShowJudgeAffiliations(showId: string): Promise<ShowJudgeAffiliation[]> {
  const [rows, trialsResult] = await Promise.all([
    fetchAssignments(showId),
    supabase
      .from('trials')
      .select('id, status, deleted_at, classes(id, deleted_at)')
      .eq('show_id', showId),
  ]);
  if (trialsResult.error) {
    throw createDatabaseError(trialsResult.error, 'trials', 'select_judge_affiliation_trials');
  }
  const judges = liveShowJudges(rows, (trialsResult.data ?? []) as unknown as LiveJudgeTrialRow[]);
  return judges;
}

/** Where a show's assigned judge stands for the Edit show affiliation field (MYK9-2294). */
export interface JudgeAffiliationEditorEntry {
  /** `ready`: a live assignment is on the server; `inactive`: only declined or cancelled ones. */
  status: 'ready' | 'inactive';
  affiliation: string | null;
}

/**
 * The server's own view of each judge assigned to this show: whether a live (not declined or
 * cancelled) assignment exists there, which is exactly what `set_judge_affiliation` requires,
 * and the affiliation on the person. It reads the person through the assignment, so a judge
 * who lost every qualification still has their value. A judge missing from the map has no
 * assignment on the server yet.
 */
export async function fetchShowJudgeAffiliationEditor(
  showId: string
): Promise<Record<string, JudgeAffiliationEditorEntry>> {
  const entries: Record<string, JudgeAffiliationEditorEntry> = {};
  for (const row of await fetchAssignments(showId)) {
    if (!row.person) continue;
    const live = row.status !== 'declined' && row.status !== 'cancelled';
    const previous = entries[row.person.id];
    entries[row.person.id] = {
      status: live || previous?.status === 'ready' ? 'ready' : 'inactive',
      affiliation: row.person.judge_affiliation?.trim() || null,
    };
  }
  return entries;
}
