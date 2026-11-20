import { createDatabaseError, supabase } from '../supabaseClient';

/** One judge on a show with the affiliation typed on their person record (MYK9-2292). */
export interface ShowJudgeAffiliation {
  id: string;
  name: string;
  affiliation: string | null;
}

interface AffiliationRow {
  person_id: string;
  status: string | null;
  judge: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    judge_affiliation: string | null;
  } | null;
}

const PAGE_SIZE = 1000;

/** Statuses that keep a judge off the premium, as the generator treats them (trialJudges.ts). */
const INACTIVE_STATUSES = new Set(['declined', 'cancelled']);

/**
 * Each judge on the show once, with their affiliation, for the ASCA premium checklist
 * (MYK9-2292). An online read of the person record, where the affiliation is typed; the checklist
 * only warns, so a failed read leaves the item out rather than reporting every judge as empty.
 */
export async function fetchShowJudgeAffiliations(showId: string): Promise<ShowJudgeAffiliation[]> {
  const rows: AffiliationRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('judge_assignments')
      .select(
        `person_id, status,
         judge:people!judge_assignments_person_id_fkey(id, first_name, last_name, judge_affiliation)`
      )
      .eq('show_id', showId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw createDatabaseError(error, 'judge_assignments', 'select_judge_affiliations');
    const page = (data ?? []) as unknown as AffiliationRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const byPerson = new Map<string, ShowJudgeAffiliation>();
  for (const row of rows) {
    const judge = row.judge;
    if (!judge || INACTIVE_STATUSES.has(row.status ?? '')) continue;
    const name = `${judge.first_name ?? ''} ${judge.last_name ?? ''}`.trim();
    if (!name || byPerson.has(judge.id)) continue;
    byPerson.set(judge.id, {
      id: judge.id,
      name,
      affiliation: judge.judge_affiliation?.trim() || null,
    });
  }
  return [...byPerson.values()];
}
