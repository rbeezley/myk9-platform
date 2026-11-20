import { createDatabaseError, supabase } from '../supabaseClient';

/**
 * MYK9-2294: a show's manager sets one judge's affiliation (ASCA §1.5.7) through the single-field
 * `set_judge_affiliation` RPC. Online only: it is a credential edit, not show-day data. A blank
 * value clears it. The server refuses (42501) unless the caller manages the show and the judge
 * is assigned to it on the server.
 */
export async function setJudgeAffiliation(
  personId: string,
  showId: string,
  affiliation: string
): Promise<void> {
  const { error } = await supabase.rpc('set_judge_affiliation', {
    p_person_id: personId,
    p_show_id: showId,
    p_affiliation: affiliation,
  });
  if (error) throw createDatabaseError(error, 'people', 'set_judge_affiliation');
}
