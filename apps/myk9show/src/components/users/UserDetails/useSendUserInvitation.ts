/**
 * useSendUserInvitation — send or resend a sign-in invitation for an EXISTING person.
 *
 * MYK9-134. MYK9-131 made "Create User" mint a real auth identity, but that path
 * only reaches a NEW person: an existing `people` row collides with the
 * case-insensitive partial unique index on `people.email`. So an invitation that
 * expired before acceptance — or a person seeded without an identity, like the
 * `admin@myk9t.com` row that blocks the Admin-minimum launch gate — had no
 * in-app recovery at all.
 *
 * No new backend. `admin-invite-user` already handles both cases and reports
 * which one happened, so the toast can state the outcome truthfully instead of
 * claiming "invitation sent" either way — the exact failure MYK9-131 was about.
 */

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';
import { queryKeys } from '@/lib/queryClient';

export interface SendInvitationArgs {
  personId: string;
  email: string | null | undefined;
  firstName?: string | null | undefined;
  roleNames?: string[] | undefined;
}

interface InviteResponse {
  outcome?: 'invited' | 'reinvited';
  /** The address the link actually went to — may differ from the contact email. */
  deliveredTo?: string;
}

export function useSendUserInvitation() {
  const queryClient = useQueryClient();
  // isPending lags a render behind the click; the ref does not. Without this a
  // double-click sends two emails.
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: async ({ personId, email, firstName, roleNames }: SendInvitationArgs) => {
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
        },
      });
      if (error) throw error;
      // The request email is deliberately NOT returned: the toast must have no
      // way to name it, since it can differ from where the link actually went.
      return { data: data as InviteResponse | null };
    },
    onSuccess: ({ data }) => {
      // Name the address the backend ACTUALLY delivered to. It differs from the
      // contact email whenever that address drifted from the auth identity, and
      // announcing the wrong one would be the same lie this feature exists to
      // stop telling.
      //
      // No fallback to the contact email when the field is missing. The app and
      // the edge function deploy INDEPENDENTLY — Vercel ships on merge while
      // `supabase functions deploy` is manual — so a newer UI can legitimately
      // meet an older function that does not report a destination. Saying
      // nothing is honest; guessing the contact address is not.
      const deliveredTo = data?.deliveredTo;
      const sentWhat = data?.outcome === 'reinvited' ? 'Sign-in link' : 'Invitation';
      notifications.success(
        deliveredTo ? `${sentWhat} sent to ${deliveredTo}.` : `${sentWhat} sent.`
      );
      // The person now has an auth identity, so the sign-in state shown on the
      // page is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error: Error, variables) => {
      if (error.message === 'NO_EMAIL') {
        notifications.error('Add an email address before sending an invitation.');
        return;
      }
      logger.error('Failed to send invitation:', 'admin', { personId: variables.personId }, error);
      notifications.error('Could not send the invitation. Please try again.');
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const sendInvitation = (args: SendInvitationArgs) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(args);
  };

  return { sendInvitation, isSending: mutation.isPending };
}
