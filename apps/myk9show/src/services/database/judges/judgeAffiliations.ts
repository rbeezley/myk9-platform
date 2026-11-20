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
  /** Whether the viewer may edit this person's record (the server's `can_edit_person`). */
  canEdit: boolean;
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

async function canEditPerson(personId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_edit_person', { p_person_id: personId });
  return !error && data === true;
}

/**
 * The judges the ASCA premium prints, once each, with their affiliation, for the premium
 * checklist (MYK9-2292). An online read of the person record, where the affiliation is typed;
 * the checklist only warns, so a failed read leaves the item out rather than reporting every
 * judge as empty. `canEdit` is asked only for a judge with none, to decide whether the item may
 * link to the profile; a failed check means no link.
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
  return Promise.all(
    judges.map(async judge => ({
      ...judge,
      canEdit: judge.affiliation ? false : await canEditPerson(judge.id),
    }))
  );
}
