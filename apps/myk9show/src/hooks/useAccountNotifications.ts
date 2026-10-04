import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';
import { useNotificationStore } from '@/store/notificationStore';
import {
  buildAccountNotificationPayload,
  type AccountNotificationRow,
} from '@/hooks/useAccountNotifications.helpers';

const POLL_MS = 60_000;

/** Row types whose delivery should also force an RBAC re-check, since they
 * mean the signed-in user's own roles changed elsewhere (a site admin
 * approving a club-access request in a different session). */
const ROLE_CHANGING_TYPES = new Set(['club_access_approved']);

/** The only `public.notifications` types this hook delivers and marks read.
 * The table also allows entry_confirmed, q_earned, schedule_change and
 * judge_assignment; those belong to other delivery paths, so this hook must
 * neither render them as "Account update" nor consume them by marking read. */
export const ACCOUNT_NOTIFICATION_TYPES = ['club_access_approved', 'waitlist_auto_offer'] as const;
const HANDLED_TYPES = new Set<string>(ACCOUNT_NOTIFICATION_TYPES);

/**
 * Delivers durable `public.notifications` rows into the existing bell/Message
 * Center: club-access approval (MYK9-859), and the secretary's notice that a
 * wait list spot was offered automatically (MYK9-1003). A club approval also
 * forces an RBAC refresh so the sidebar reflects the new role without a
 * sign-out.
 * The database row stays unread until the requester views or dismisses it,
 * so the bell can restore the notice after a reload.
 *
 * Goes straight to the store's `addAlert` rather than
 * `useNotificationDelivery().deliver()` — `deliver` suppresses (and never
 * calls `addAlert`) when the user's master notification toggle is off or
 * they're mid-ring, and this hook has no other consumer of the durable row:
 * suppressed here means marked read and gone forever, silently defeating the
 * one thing MYK9-859 exists to do. An account-level notice like "your club
 * was approved" isn't the ambient show-day chatter that toggle is for.
 */
/** A fetch result bound to the user it was fetched for, so a delivered row
 * can never be attributed to whichever user happens to be signed in when
 * the fetch resolves — required after an in-app account switch left rows
 * bound only to the query's cache key, not to the effect that delivers them. */
interface AccountNotificationsResult {
  userId: string;
  rows: AccountNotificationRow[];
}

export function useAccountNotifications(): void {
  const { userWithRoles, refreshPermissions } = useAuthContext();
  const addAlert = useNotificationStore(s => s.addAlert);
  const dismissAlert = useNotificationStore(s => s.dismissAlert);
  const authUserId = userWithRoles?.id ?? null;

  const query = useQuery({
    queryKey: queryKeys.accountNotifications(authUserId),
    queryFn: async (): Promise<AccountNotificationsResult> => {
      const userId = authUserId as string;
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, deep_link_url, created_at')
        .eq('user_id', userId)
        .in('type', [...ACCOUNT_NOTIFICATION_TYPES])
        .is('read_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return { userId, rows: data ?? [] };
    },
    enabled: Boolean(authUserId),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  const data = query.data;
  const dataUpdatedAt = query.dataUpdatedAt;

  useEffect(() => {
    // The bell is device-local. A prior account's notice must not remain
    // visible after an in-app account switch; its database row stays unread.
    for (const alert of useNotificationStore.getState().recentAlerts) {
      const owner = alert.payload.data?.accountNotificationUserId;
      if (typeof owner === 'string' && owner !== authUserId) {
        dismissAlert(alert.payload.id);
      }
    }
  }, [authUserId, dismissAlert]);

  useEffect(() => {
    // A fetch started for the previous user can resolve after an account
    // switch; only ever act on a result that matches who is signed in now.
    if (!data || data.userId !== authUserId || data.rows.length === 0) return;
    const { userId, rows } = data;

    // Reconcile against the bell, not a mount-long ID list. A durable
    // unread row removed from local state can return on the next poll.
    const visibleIds = new Set(
      useNotificationStore
        .getState()
        .recentAlerts.filter(alert => alert.payload.data?.accountNotificationUserId === userId)
        .map(alert => alert.payload.id)
    );
    const unseen = rows.filter(row => HANDLED_TYPES.has(row.type) && !visibleIds.has(row.id));
    if (unseen.length === 0) return;

    let shouldRefreshPermissions = false;
    for (const row of unseen) {
      visibleIds.add(row.id);
      addAlert(buildAccountNotificationPayload(row, userId));
      if (ROLE_CHANGING_TYPES.has(row.type)) shouldRefreshPermissions = true;
    }
    if (shouldRefreshPermissions) refreshPermissions();
  }, [data, dataUpdatedAt, addAlert, refreshPermissions, authUserId]);
}
