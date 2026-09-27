import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNotificationDelivery } from '@/hooks/useNotificationDelivery';
import {
  buildAccountNotificationPayload,
  type AccountNotificationRow,
} from '@/hooks/useAccountNotifications.helpers';

const POLL_MS = 60_000;

/** Row types whose delivery should also force an RBAC re-check, since they
 * mean the signed-in user's own roles changed elsewhere (a site admin
 * approving a club-access request in a different session). */
const ROLE_CHANGING_TYPES = new Set(['club_access_approved']);

/**
 * Delivers durable `public.notifications` rows (currently just club-access
 * approval, MYK9-859) into the existing bell/Message Center, and forces an
 * RBAC refresh so the sidebar reflects a new role grant without a sign-out.
 * Ephemeral by design, matching every other alert in the store: a row is
 * marked read immediately after delivery, so a reload shows it once.
 */
export function useAccountNotifications(): void {
  const { userWithRoles, refreshPermissions } = useAuthContext();
  const { deliver } = useNotificationDelivery();
  const authUserId = userWithRoles?.id ?? null;
  const deliveredRef = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['account-notifications', authUserId],
    queryFn: async (): Promise<AccountNotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, message, deep_link_url, created_at')
        .eq('user_id', authUserId as string)
        .is('read_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(authUserId),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });

  const rows = query.data;
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    const unseen = rows.filter(row => !deliveredRef.current.has(row.id));
    if (unseen.length === 0) return;

    let shouldRefreshPermissions = false;
    for (const row of unseen) {
      deliveredRef.current.add(row.id);
      deliver(buildAccountNotificationPayload(row));
      if (ROLE_CHANGING_TYPES.has(row.type)) shouldRefreshPermissions = true;
    }
    if (shouldRefreshPermissions) refreshPermissions();

    void supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in(
        'id',
        unseen.map(row => row.id)
      );
  }, [rows, deliver, refreshPermissions]);
}
