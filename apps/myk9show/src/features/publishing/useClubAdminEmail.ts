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

/**
 * MYK9-2208: the names and the "Email them the link" mailto for the payouts line, or undefined
 * while loading, offline, failed or when the club has nobody to name (the line then reads as it
 * did before, with no mailto). Online-only on purpose; `enabled` is false for a club admin, who
 * fixes the line herself.
 */
export function useClubAdminEmail(
  showId: string | undefined,
  clubId: string | undefined,
  enabled: boolean
): ClubAdminEmail | undefined {
  const online = useIsOnline();
  const asked = Boolean(showId) && Boolean(clubId) && enabled;
  const query = useQuery({
    queryKey: clubAdminContactsQueryKey(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.rpc('get_show_club_admin_contacts', { p_show_id: showId as string }),
        PUBLISH_BLOCKERS_DEADLINE_MS,
        'get_show_club_admin_contacts'
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
