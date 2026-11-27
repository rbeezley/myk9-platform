import { supabase } from '@/services/database/supabaseClient';
import { fetchShowOfficials, type ShowOfficial } from '@/hooks/queries/useShowOfficials';
import { OfficialAlreadyHoldsRoleError } from '@/components/shows/wizard/steps/useCreateOfficialPerson';

export type SingleHolderRole = 'chairman' | 'secretary';

export interface ReplaceShowOfficialResult {
  /** Prior holders whose revoke failed: they are still listed. */
  stillListed: ShowOfficial[];
  /** First revoke error message, when any revoke failed. */
  revokeError: string | null;
}

/**
 * Makes `personId` the only holder of a single-holder role (chairman, secretary).
 *
 * The current holders are read fresh from the server, never from the editor's cached
 * query: a cache that is empty (query failed, offline) or stale (another tab added a
 * holder) would otherwise grant without revoking and report success while the old
 * holder stays on the show. A failed read throws before anything is written.
 *
 * Grants first, so a failed grant leaves the current holders untouched (throws). Then
 * revokes every other holder and reports who is left.
 */
export async function replaceShowOfficial(params: {
  showId: string;
  role: SingleHolderRole;
  personId: string;
}): Promise<ReplaceShowOfficialResult> {
  const { showId, role, personId } = params;

  const officials = await fetchShowOfficials(showId);
  const currentHolders = role === 'chairman' ? officials.chairmen : officials.secretaries;
  // Chair and Secretary are different people (MYK9-2493). Checked on the fresh read, because the
  // editor's cached list can be minutes old when another manager changed the other role.
  const otherRoleHolder = (role === 'chairman' ? officials.secretaries : officials.chairmen).find(
    holder => holder.personId === personId
  );
  if (otherRoleHolder) {
    throw new OfficialAlreadyHoldsRoleError(
      `${otherRoleHolder.firstName} ${otherRoleHolder.lastName}`.trim()
    );
  }

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
