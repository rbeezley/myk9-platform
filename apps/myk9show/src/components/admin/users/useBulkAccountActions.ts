/**
 * Bulk Suspend / Reinstate, Send invitation and Restore for the admin roster's
 * floating bar. Each reuses the path the single-person action already takes:
 *
 * - Suspend / Reinstate: `useUpdateUserMutation` with `{ status }`, as the row
 *   menu does (UserTable/index.tsx), and never the admin's own account.
 * - Send invitation: `invokeAdminInvite`, shared with the person page.
 * - Restore: `restoreUser`, shared with the row menu and Deleted Items.
 *
 * The selection this hook receives is ids only (MYK9-835). `usersById` is the
 * live roster query's current data, used for the initial targets. A "Retry
 * failed" run fires later from a toast, AFTER every run has cleared the
 * selection and unmounted this hook's bar — so nothing this component owns (a
 * ref, a closure) can be trusted to still be current (Codex P1 on 794a83820).
 * The retry's `applicableWhen` therefore refetches the roster query, which
 * outlives the bar, and re-resolves eligibility from that fresh data before any
 * person is acted on: a status change, a sign-in, or the person leaving the
 * roster between dispatch and retry is skipped, not re-run. If the roster cannot
 * be refreshed, nobody is retried (an invitation is an email to a real person).
 *
 * Runs go through `useBulkDispatch`, which reports one summary toast and offers
 * "Retry failed" for any person the action could not reach.
 */

import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { BulkVerificationUnavailableError } from '@/hooks/bulkDispatch';
import { useUpdateUserMutation, type AdminUser } from '@/hooks/queries/useUsersQuery';
import { restoreUser } from '@/services/database/users';
import { queryKeys } from '@/lib/queryClient';
import { invokeAdminInvite } from '@/components/users/UserDetails/useSendUserInvitation';
import { readLiveRoster, refreshLiveRoster } from './liveRoster';
import { accountTargets, isEligible, nameOf, type AccountAction } from './bulkAccountTargets';

export type { AccountAction as BulkAccountAction } from './bulkAccountTargets';

interface UseBulkAccountActionsOptions {
  selectedIds: string[];
  usersById: ReadonlyMap<string, AdminUser>;
  onClearSelection: () => void;
}

export function useBulkAccountActions({
  selectedIds,
  usersById,
  onClearSelection,
}: UseBulkAccountActionsOptions) {
  const { user, userWithRoles, hasPermission } = useAuthContext();
  const currentUserId = userWithRoles?.databaseUserId ?? user?.id;
  const canChangeStatus = hasPermission('admin:manage');

  const targets = useMemo(
    () => accountTargets(selectedIds, usersById, currentUserId),
    [selectedIds, usersById, currentUserId]
  );

  const queryClient = useQueryClient();
  const updateUser = useUpdateUserMutation();
  const dispatch = useBulkDispatch<string>({
    getLabel: id => nameOf(id, readLiveRoster(queryClient) ?? usersById),
  });
  // Suspend and Send invitation reach people outside this screen, so they confirm first.
  const [confirming, setConfirming] = useState<AccountAction | null>(null);

  const workers: Record<AccountAction, (id: string) => Promise<void>> = {
    suspend: async id => {
      await updateUser.mutateAsync({ id, updates: { status: 'suspended' } });
    },
    reinstate: async id => {
      await updateUser.mutateAsync({ id, updates: { status: 'active' } });
    },
    invite: async id => {
      // Read the CURRENT record, not one captured at selection time — a retry
      // must send whatever name/roles the person has NOW.
      const target = (readLiveRoster(queryClient) ?? usersById).get(id);
      if (!target) throw new Error('This person is no longer on the roster.');
      await invokeAdminInvite({
        personId: id,
        email: target.email,
        firstName: target.firstName,
        roleNames: (target.roles ?? []).map(String),
      });
    },
    restore: async id => {
      const { error } = await restoreUser(id);
      if (error) throw error;
    },
  };

  // Whatever the outcome — full success, partial, or every person failed — a
  // mutating action ends by CLEARING the selection, so a stale selection can
  // never offer the same action again on people it just changed (Codex P2,
  // round 3 on c839caa07).
  //
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
  const refreshing = (worker: (id: string) => Promise<void>) => async (id: string) => {
    await worker(id);
    scheduleRefresh();
  };

  const run = async (action: AccountAction) => {
    const outcome = await dispatch.run(targets[action], refreshing(workers[action]), {
      // A retry fires later, from the toast, when this component may be gone.
      // Re-resolve THIS action's eligibility against a roster refetched now —
      // not anything captured at dispatch — so a person who signed in, changed
      // status, or left the roster in between is skipped, not re-run (MYK9-835).
      // No refreshable roster means no one can be confirmed eligible: nobody is
      // acted on, and the retry says it COULD NOT VERIFY rather than claiming
      // anyone is ineligible.
      applicableWhen: async id => {
        const fresh = await refreshLiveRoster(queryClient);
        if (!fresh) {
          throw new BulkVerificationUnavailableError(
            "Couldn't refresh the user list — nothing was retried."
          );
        }
        return isEligible(action, id, fresh, currentUserId);
      },
    });
    // null = a batch is already in flight; nothing ran, so change nothing.
    if (outcome === null) return;
    setConfirming(null);
    onClearSelection();
  };

  return {
    targets,
    canChangeStatus,
    confirming,
    setConfirming,
    run,
    isBusy: dispatch.isBusy,
  };
}
