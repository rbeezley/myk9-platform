/**
 * Club admins tab state (MYK9-2209): who administers this club, adding one by email, removing one.
 *
 * Both writes are online-only RPCs (a role change needs a recent password). After either, the
 * signed-in user's own permissions are refreshed, so Payments access follows at once when the
 * admin removed themselves.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addClubAdminByEmail,
  getClubAdmins,
  removeClubAdmin,
  type ClubAdmin,
} from '@/services/database/club-memberships';
import { useAuthContext } from '@/hooks/useAuthContext';
import { notifications } from '@/lib/notifications';
import { logger } from '@/services/LoggingService';

const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';
const LAST_ADMIN_MESSAGE = 'A club needs at least one admin. Add another admin first.';

// Role changes need a recent password and are never replayed: offline fails at once with the toast,
// and a cancelled step-up prompt does not open a second one (same options as the payout decisions).
const ADMIN_MUTATION_OPTIONS = { retry: false, networkMode: 'always' } as const;

export function clubAdminsQueryKey(clubId: string) {
  return ['club-admins', clubId] as const;
}

// PostgREST errors are plain objects ({ message, code, ... }), not Error instances, so read the
// fields directly. Only the messages this feature's SQL raises on purpose are shown verbatim.
function failureMessage(error: unknown, fallback: string): string {
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  if (message === LAST_ADMIN_MESSAGE || message === INVALID_EMAIL_MESSAGE) return message;
  if (code === 'MKAUT') return 'Confirm your password to continue.';
  return fallback;
}

export function useClubAdmins(clubId: string) {
  const queryClient = useQueryClient();
  const { refreshPermissions, userWithRoles } = useAuthContext();
  const navigate = useNavigate();
  const [pendingRemoval, setPendingRemoval] = useState<ClubAdmin | null>(null);

  const adminsQuery = useQuery({
    queryKey: clubAdminsQueryKey(clubId),
    queryFn: () => getClubAdmins(clubId),
    // Roles change on the server, not in the replica: always ask.
    refetchOnMount: 'always',
  });

  const afterChange = async () => {
    await queryClient.invalidateQueries({ queryKey: clubAdminsQueryKey(clubId) });
    await refreshPermissions();
  };

  const addMutation = useMutation({
    ...ADMIN_MUTATION_OPTIONS,
    mutationFn: (email: string) => addClubAdminByEmail(clubId, email),
    onSuccess: async (result, email) => {
      if (result === 'added') {
        notifications.success(`${email} is now an admin of this club.`);
      } else {
        notifications.error(
          `${email} doesn't have a myK9 account yet. Ask them to create one, then add them here.`
        );
        return;
      }
      await afterChange();
    },
    onError: error => {
      logger.error('Failed to add club admin', 'club-admin', {
        error: (error as { message?: unknown } | null)?.message ?? String(error),
      });
      notifications.error(failureMessage(error, "We couldn't add that admin. Please try again."));
    },
  });

  const removeMutation = useMutation({
    ...ADMIN_MUTATION_OPTIONS,
    mutationFn: (personId: string) => removeClubAdmin(clubId, personId),
    onSuccess: async (_data, personId) => {
      // Removing yourself ends your access to this tab: say so and leave, rather than refetching a
      // list you may no longer be allowed to read.
      if (userWithRoles?.databaseUserId && personId === userWithRoles.databaseUserId) {
        notifications.success('You are no longer an admin of this club.');
        await refreshPermissions();
        navigate(`/clubs/${clubId}`);
        return;
      }
      notifications.success('Admin removed.');
      await afterChange();
    },
    onError: error => {
      logger.error('Failed to remove club admin', 'club-admin', {
        error: (error as { message?: unknown } | null)?.message ?? String(error),
      });
      notifications.error(
        failureMessage(error, "We couldn't remove that admin. Please try again.")
      );
    },
  });

  const confirmRemoval = () => {
    if (pendingRemoval) removeMutation.mutate(pendingRemoval.personId);
    setPendingRemoval(null);
  };

  return {
    admins: adminsQuery.data ?? [],
    isLoading: adminsQuery.isLoading,
    isError: adminsQuery.isError,
    retry: () => void adminsQuery.refetch(),
    addAdmin: (email: string) => addMutation.mutateAsync(email),
    isAdding: addMutation.isPending,
    pendingRemoval,
    requestRemoval: setPendingRemoval,
    cancelRemoval: () => setPendingRemoval(null),
    confirmRemoval,
    isRemoving: removeMutation.isPending,
  };
}
