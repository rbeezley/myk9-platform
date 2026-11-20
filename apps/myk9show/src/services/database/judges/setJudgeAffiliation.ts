import { createDatabaseError, supabase } from '../supabaseClient';
import {
  PERSON_EDIT_NEEDS_CONNECTION_CODE,
  PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
} from '@/utils/signInEmailMessages';

/**
 * MYK9-2294: a show's manager sets one judge's affiliation (ASCA §1.5.7) through the single-field
 * `set_judge_affiliation` RPC. Online only: it is a credential edit, not show-day data, so offline
 * it is refused with the person-edit reconnect message (MYK9-1090) instead of pausing. A blank
 * value clears it. The server refuses (42501) unless the caller manages the show and the judge
 * is assigned to it on the server.
 */
export async function setJudgeAffiliation(
  personId: string,
  showId: string,
  affiliation: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = Object.assign(new Error(PERSON_EDIT_NEEDS_CONNECTION_MESSAGE), {
      code: PERSON_EDIT_NEEDS_CONNECTION_CODE,
    });
    throw createDatabaseError(offline, 'people', 'set_judge_affiliation');
  }
  const { error } = await supabase.rpc('set_judge_affiliation', {
    p_person_id: personId,
    p_show_id: showId,
    p_affiliation: affiliation,
  });
  if (error) throw createDatabaseError(error, 'people', 'set_judge_affiliation');
}
