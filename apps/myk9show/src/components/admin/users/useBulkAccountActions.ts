/**
 * Bulk Suspend / Reinstate, Send invitation, Restore and Copy emails for the
 * admin roster's floating bar. Each reuses the path the single-person action
 * already takes:
 *
 * - Suspend / Reinstate: `useUpdateUserMutation` with `{ status }`, as the row
 *   menu does (UserTable/index.tsx), and never the admin's own account.
 * - Send invitation: `invokeAdminInvite`, shared with the person page.
 * - Restore: `restoreUser`, shared with the row menu and Deleted Items.
 *
 * Runs go through `useBulkDispatch`, which reports one summary toast and offers
 * "Retry failed" for any person the action could not reach.
 */

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import { restoreUser } from '@/services/database/users';
import { queryKeys } from '@/lib/queryClient';
import { invokeAdminInvite } from '@/components/users/UserDetails/useSendUserInvitation';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { accountTargets, nameOf, selectedEmails } from './bulkAccountTargets';

export type BulkAccountAction = 'suspend' | 'reinstate' | 'invite' | 'restore';

interface UseBulkAccountActionsOptions {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
}

export function useBulkAccountActions({
  selectedUsers,
  onClearSelection,
}: UseBulkAccountActionsOptions) {
  const { user, userWithRoles, hasPermission } = useAuthContext();
  const currentUserId = userWithRoles?.databaseUserId ?? user?.id;
  const canChangeStatus = hasPermission('admin:manage');
  const targets = useMemo(
    () => accountTargets(selectedUsers, currentUserId),
    [selectedUsers, currentUserId]
  );
  const queryClient = useQueryClient();
  const updateUser = useUpdateUserMutation();
  const dispatch = useBulkDispatch<SelectedUser>({ getLabel: nameOf });
  // Suspend and Send invitation reach people outside this screen, so they confirm first.
  const [confirming, setConfirming] = useState<BulkAccountAction | null>(null);

  const workers: Record<BulkAccountAction, (item: SelectedUser) => Promise<void>> = {
    suspend: async item => {
      await updateUser.mutateAsync({ id: item.id, updates: { status: 'suspended' } });
    },
    reinstate: async item => {
      await updateUser.mutateAsync({ id: item.id, updates: { status: 'active' } });
    },
    invite: async item => {
      await invokeAdminInvite({
        personId: item.id,
        email: item.user.email,
        firstName: item.user.firstName,
        roleNames: (item.user.roles ?? []).map(String),
      });
    },
    restore: async item => {
      const { error } = await restoreUser(item.id);
      if (error) throw error;
    },
  };

  // Whatever the outcome — full success, partial, or every person failed — a
  // mutating action ends by CLEARING the selection. A
  // kept selection holds the pre-action user objects, so after a partial
  // Suspend the people who were suspended would still read as active and be
  // offered Suspend again (Codex P2, round 3). The dispatch's own toast keeps
  // "Retry failed" for the ones that did not go through.
  // The roster refreshes whenever ANY person's change lands — in the first run
  // or in a later "Retry failed", which runs inside the dispatch after `run`
  // has returned (Codex P2 on c839caa07). Successes that land together share
  // one refresh instead of refetching the roster once per person.
  const refreshQueued = useRef(false);
  const scheduleRefresh = () => {
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    setTimeout(() => {
      refreshQueued.current = false;
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    }, 0);
  };
  const refreshing =
    (worker: (item: SelectedUser) => Promise<void>) => async (item: SelectedUser) => {
      await worker(item);
      scheduleRefresh();
    };

  const run = async (action: BulkAccountAction) => {
    const outcome = await dispatch.run(targets[action], refreshing(workers[action]));
    // null = a batch is already in flight; nothing ran, so change nothing.
    if (outcome === null) return;
    setConfirming(null);
    onClearSelection();
  };

  const copyEmails = async () => {
    const emails = selectedEmails(selectedUsers);
    const missing = selectedUsers.length - emails.length;
    if (emails.length === 0) {
      toast.error('None of the selected people has an email address.');
      return;
    }
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      toast.success(
        `Copied ${emails.length} email ${emails.length === 1 ? 'address' : 'addresses'}`,
        missing > 0 ? { description: `${missing} selected without an email.` } : undefined
      );
    } catch {
      toast.error('Could not copy to the clipboard. Try Export instead.');
    }
  };

  return {
    targets,
    canChangeStatus,
    confirming,
    setConfirming,
    run,
    copyEmails,
    isBusy: dispatch.isBusy,
  };
}
