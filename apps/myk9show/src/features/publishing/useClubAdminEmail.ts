import { useQuery } from '@tanstack/react-query';
import { withTimeout } from '@myk9/replication';
import { supabase } from '@/lib/supabase';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { clubPaymentsHref } from '@/features/payments/useCanOpenClubPayments';
import {
  buildClubAdminEmail,
  parseClubAdminContacts,
  type ClubAdminEmail,
} from './clubAdminContacts';
import { PUBLISH_BLOCKERS_DEADLINE_MS } from './usePublishBlockers';

export const clubAdminContactsQueryKey = (showId: string) =>
  ['shows', showId, 'club-admin-contacts'] as const;
export const clubOnlyAdminContactsQueryKey = (clubId: string) =>
  ['clubs', clubId, 'club-admin-contacts'] as const;

/**
 * MYK9-2208: the names and the "Email them the link" mailto for the payouts line, or undefined
 * while loading, offline, failed or when the club has nobody to name (the line then reads as it
 * did before, with no mailto). Online-only on purpose; `enabled` is false for a club admin, who
 * fixes the line herself.
 *
 * MYK9-2217: with a show id it reads get_show_club_admin_contacts; with none (the new-show wizard,
 * a club that has no draft yet) it reads get_club_admin_contacts, which has the same caller rule.
 */
export function useClubAdminEmail(
  showId: string | undefined,
  clubId: string | undefined,
  enabled: boolean
): ClubAdminEmail | undefined {
  const online = useIsOnline();
  const asked = Boolean(clubId) && enabled;
  const query = useQuery({
    queryKey: showId
      ? clubAdminContactsQueryKey(showId)
      : clubOnlyAdminContactsQueryKey(clubId ?? ''),
    queryFn: async () => {
      const { data, error } = await withTimeout(
        showId
          ? supabase.rpc('get_show_club_admin_contacts', { p_show_id: showId })
          : supabase.rpc('get_club_admin_contacts', { p_club_id: clubId as string }),
        PUBLISH_BLOCKERS_DEADLINE_MS,
        showId ? 'get_show_club_admin_contacts' : 'get_club_admin_contacts'
      );
      if (error) throw error;
      return parseClubAdminContacts(data);
    },
    enabled: asked && online,
    networkMode: 'always',
    retry: false,
    staleTime: 60_000,
  });
  if (!asked || !online || query.isError || !query.data) return undefined;
  return (
    buildClubAdminEmail(
      query.data,
      `${window.location.origin}${clubPaymentsHref(clubId as string)}`
    ) ?? undefined
  );
}
