import { supabase } from '@/services/database/supabaseClient';
import type { ShowOfficial } from '@/hooks/queries/useShowOfficials';

export interface ReplaceShowOfficialResult {
  /** Prior holders whose revoke failed: they are still listed. */
  stillListed: ShowOfficial[];
  /** First revoke error message, when any revoke failed. */
  revokeError: string | null;
}

/**
 * Makes `personId` the only holder of a single-holder role (chairman, secretary).
 * Grants first, so a failed grant leaves the current holders untouched; throws on
 * that failure. Then revokes every other current holder and reports who is left.
 */
export async function replaceShowOfficial(params: {
  showId: string;
  role: string;
  personId: string;
  currentHolders: ShowOfficial[];
}): Promise<ReplaceShowOfficialResult> {
  const { showId, role, personId, currentHolders } = params;

  if (currentHolders.length === 1 && currentHolders[0].personId === personId) {
    return { stillListed: [], revokeError: null };
  }

  const { error } = await supabase.rpc('grant_show_official', {
    p_person_id: personId,
    p_role_name: role,
    p_show_id: showId,
  });
  if (error) throw error;

  const others = currentHolders.filter(holder => holder.personId !== personId);
  const outcomes = await Promise.all(
    others.map(async holder => {
      try {
        const { error: revokeError } = await supabase.rpc('revoke_show_official', {
          p_person_id: holder.personId,
          p_role_name: role,
          p_show_id: showId,
        });
        return { holder, message: revokeError ? revokeError.message : null };
      } catch (err) {
        return { holder, message: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  const failed = outcomes.filter(outcome => outcome.message !== null);
  return {
    stillListed: failed.map(outcome => outcome.holder),
    revokeError: failed[0]?.message ?? null,
  };
}
