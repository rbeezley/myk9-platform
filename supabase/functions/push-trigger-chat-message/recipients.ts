import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { assertAudienceQuerySucceeded } from '../_shared/fanoutErrors.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { USER_ROLE_HOLDER_EMBED } from '../_shared/userRolePerson.ts';

interface RecipientRoleRow {
  people?: { auth_user_id?: string | null } | null;
}

/**
 * Auth user ids of the staff an exhibitor's show message goes to: the club's
 * secretaries plus platform admins. Any failed audience query aborts the
 * fanout (fail closed) rather than delivering to a partial audience.
 */
export async function getShowStaffRecipientIds(
  supabase: SupabaseClient,
  clubId: string
): Promise<string[]> {
  const { data: secretaries, error: secretariesError } = await applyActiveRoleValidity(
    supabase
      .from('user_roles')
      .select(`id, club_id, ${USER_ROLE_HOLDER_EMBED}!inner(auth_user_id), roles!inner(name)`)
      .eq('club_id', clubId)
      .in('roles.name', ['secretary', 'trial_secretary'])
      .not('people.auth_user_id', 'is', null)
  );

  // Also include platform admins
  const { data: admins, error: adminsError } = await applyActiveRoleValidity(
    supabase
      .from('user_roles')
      .select(`id, ${USER_ROLE_HOLDER_EMBED}!inner(auth_user_id), roles!inner(name)`)
      .eq('roles.name', 'platform_admin')
      .not('people.auth_user_id', 'is', null)
  );

  assertAudienceQuerySucceeded(secretariesError);
  assertAudienceQuerySucceeded(adminsError);

  const allRecipients = [...(secretaries || []), ...(admins || [])];
  const authIds = (allRecipients as RecipientRoleRow[])
    .map(recipient => recipient.people?.auth_user_id)
    .filter((authUserId): authUserId is string => Boolean(authUserId));
  return [...new Set(authIds)];
}
