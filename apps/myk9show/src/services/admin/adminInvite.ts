/**
 * Client call to the `admin-invite-user` edge function for ONE existing person. Shared by the
 * person page's resend, the roster's bulk "Send invitation" and a club admin inviting the person
 * they just added as an admin (MYK9-2209).
 */

import { supabase } from '@/services/database/supabaseClient';
import { isEdgeStepUpRefusal, stepUpRefusalError } from '@/features/step-up/edgeStepUpRefusal';

export interface SendInvitationArgs {
  personId: string;
  email: string | null | undefined;
  firstName?: string | null | undefined;
  roleNames?: string[] | undefined;
  /**
   * Bulk sends set this: the SERVER then declines (outcome 'skipped', no email)
   * for an account that has already signed in, judged from the live auth
   * record rather than any client snapshot. A single resend leaves it unset and
   * keeps re-inviting by design.
   */
  onlyIfNeverSignedIn?: boolean | undefined;
  /** A club admin inviting the person they just added as an admin of this club (MYK9-2209). */
  clubId?: string | undefined;
}

export interface InviteResponse {
  outcome?: 'invited' | 'reinvited' | 'skipped' | 'not_found';
  reason?: 'already_signed_in';
  /** The address the link actually went to — may differ from the contact email. */
  deliveredTo?: string;
}

/**
 * Calls `admin-invite-user` for one existing person. Shared by this hook and the
 * roster's bulk "Send invitation", so both reach the backend the same way.
 */
export async function invokeAdminInvite({
  personId,
  email,
  firstName,
  roleNames,
  onlyIfNeverSignedIn,
  clubId,
}: SendInvitationArgs): Promise<{ data: InviteResponse | null }> {
  if (!email) {
    throw new Error('NO_EMAIL');
  }
  const { data, error } = await supabase.functions.invoke('admin-invite-user', {
    body: {
      email,
      firstName: firstName ?? '',
      roleLabels: roleNames ?? [],
      // Nothing syncs people.email to auth.users.email, so a person whose
      // address was edited after signup can no longer be found by it. The
      // function resolves the identity from this instead. MYK9-134.
      personId,
      ...(onlyIfNeverSignedIn ? { onlyIfNeverSignedIn: true } : {}),
      ...(clubId ? { clubId } : {}),
    },
  });
  if (error) throw (await isEdgeStepUpRefusal(error)) ? stepUpRefusalError() : error;
  // The request email is deliberately NOT returned: the toast must have no
  // way to name it, since it can differ from where the link actually went.
  return { data: data as InviteResponse | null };
}
