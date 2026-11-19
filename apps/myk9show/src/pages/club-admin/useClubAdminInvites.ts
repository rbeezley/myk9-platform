/**
 * Pending club-admin invitations (MYK9-2211): invite an address that has no account, list the
 * pending ones, resend and cancel. An invite grants nothing until the invitee accepts it with the
 * emailed one-time link, so none of these change anyone's access and no permission refresh is
 * needed. All calls are online-only; a failed email send is said plainly, never as success.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelClubAdminInvite,
  ClubAdminInviteSendError,
  getClubAdminInvites,
  inviteClubAdmin,
  sendClubAdminInviteEmail,
} from '@/services/database/club-memberships';
import { clubAdminsQueryKey } from './useClubAdmins';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';
const MUTATION_OPTIONS = { retry: false, networkMode: 'always' } as const;

export function clubAdminInvitesQueryKey(clubId: string) {
  return ['club-admin-invites', clubId] as const;
}

function errorFields(error: unknown): { message: string | undefined; code: string | undefined } {
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  return {
    message: typeof message === 'string' ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

// Only messages the SQL raises on purpose are shown; anything else gets the fallback.
function inviteFailureMessage(error: unknown, fallback: string): string {
  const { message, code } = errorFields(error);
  if (message === INVALID_EMAIL_MESSAGE) return message;
  if (code === 'MKAUT') return 'Confirm your password to continue.';
  return fallback;
}

// The real reason a resend was refused, from the RPC's reason code (carried by the edge function).
function resendFailureMessage(error: unknown, email: string): string {
  if (error instanceof ClubAdminInviteSendError) {
    switch (error.reason) {
      case 'cap':
        return 'This invite has been sent the most times allowed. Cancel it and invite again.';
      case 'expired':
        return 'This invite has expired. Cancel it and invite again.';
      case 'inactive':
        return 'This invite is no longer pending.';
      case 'throttled':
        return 'That invite was just sent. Wait a moment and try again.';
      default:
        if (error.status === 403) return "You can't send this invite.";
    }
  }
  return `We couldn't resend the invite to ${email}. Please try again.`;
}

const SEND_FAILED = (email: string) =>
  `The invite for ${email} was saved, but we couldn't email it. Use Resend to try again.`;

export function useClubAdminInvites(clubId: string) {
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: clubAdminInvitesQueryKey(clubId),
    queryFn: () => getClubAdminInvites(clubId),
    refetchOnMount: 'always',
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: clubAdminInvitesQueryKey(clubId) });

  const inviteMutation = useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: async (email: string) => {
      const result = await inviteClubAdmin(clubId, email);
      if (result.outcome === 'has_account' || !result.inviteId)
        return { ...result, emailed: false };
      try {
        await sendClubAdminInviteEmail(result.inviteId);
        return { ...result, emailed: true };
      } catch (error) {
        logger.error('Failed to email club admin invite', 'club-admin', {
          error: errorFields(error).message ?? String(error),
        });
        return { ...result, emailed: false };
      }
    },
    onSuccess: async (result, email) => {
      if (result.outcome === 'has_account') {
        notifications.error(
          `${email} already has a myK9 account. Ask them to confirm that email and sign in to myK9 once, then use the Add admin box above.`
        );
        return;
      }
      if (result.emailed) {
        notifications.success(
          result.outcome === 'already_invited'
            ? `${email} was already invited. We sent the invite again.`
            : `Invite sent to ${email}. They become an admin once they sign in with that email and accept it.`
        );
      } else {
        notifications.error(SEND_FAILED(email));
      }
      await refresh();
    },
    onError: error => {
      logger.error('Failed to invite club admin', 'club-admin', {
        error: errorFields(error).message ?? String(error),
      });
      notifications.error(
        inviteFailureMessage(error, "We couldn't invite that person. Please try again.")
      );
    },
  });

  const resendMutation = useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: ({ inviteId }: { inviteId: string; email: string }) =>
      sendClubAdminInviteEmail(inviteId),
    onSuccess: async (_data, { email }) => {
      notifications.success(`Invite sent again to ${email}.`);
      await refresh();
    },
    onError: (error, { email }) => {
      logger.error('Failed to resend club admin invite', 'club-admin', {
        error: errorFields(error).message ?? String(error),
      });
      notifications.error(resendFailureMessage(error, email));
    },
  });

  const cancelMutation = useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: ({ inviteId }: { inviteId: string; email: string }) =>
      cancelClubAdminInvite(inviteId),
    onSuccess: async (outcome, { email }) => {
      if (outcome === 'already_accepted') {
        // The invitee accepted while this page was open: they are an admin now, in the admins list.
        notifications.error(
          `${email} already accepted this invite and is an admin. Use Remove admin to end their access.`
        );
        await Promise.all([
          refresh(),
          queryClient.invalidateQueries({ queryKey: clubAdminsQueryKey(clubId) }),
        ]);
        return;
      }
      notifications.success(`Invite for ${email} cancelled.`);
      await refresh();
    },
    onError: error => {
      logger.error('Failed to cancel club admin invite', 'club-admin', {
        error: errorFields(error).message ?? String(error),
      });
      notifications.error("We couldn't cancel that invite. Please try again.");
    },
  });

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading && invitesQuery.fetchStatus !== 'paused',
    isError: invitesQuery.isError,
    retry: () => void invitesQuery.refetch(),
    inviteByEmail: (email: string) => inviteMutation.mutateAsync(email),
    isInviting: inviteMutation.isPending,
    resendInvite: (invite: { inviteId: string; email: string }) => resendMutation.mutate(invite),
    resendingId: resendMutation.isPending ? resendMutation.variables?.inviteId : undefined,
    cancelInvite: (invite: { inviteId: string; email: string }) => cancelMutation.mutate(invite),
    cancellingId: cancelMutation.isPending ? cancelMutation.variables?.inviteId : undefined,
  };
}
