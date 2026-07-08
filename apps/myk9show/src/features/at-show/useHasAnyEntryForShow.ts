/**
 * exhibitor-show-day-access: does the signed-in exhibitor have ANY entry in
 * this show, at any point in time — not just today.
 *
 * `useAccountTodayAutoFavorites`'s `hasAccountEntryForShow` is deliberately
 * scoped to TODAY (it drives ringside auto-favoriting for a live show), so an
 * exhibitor entered in a show running weeks from now correctly gets no
 * ringside access — that gating is right. But the at-show no-access gate then
 * has no signal to tell "an entered exhibitor visiting early" apart from "a
 * stranger with no relationship to this show," so it always spoke in
 * worker-passcode language. This hook supplies that missing signal from the
 * same account-level, offline-aware entry source already used by My Shows.
 */
import { useQuery } from '@tanstack/react-query';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { getUserEntries } from '@/services/database/entries';

export function useHasAnyEntryForShow(showId: string | undefined): {
  hasAnyEntryForShow: boolean;
  isLoading: boolean;
} {
  const personId = useCurrentUserPersonId();

  const { data, isLoading } = useQuery({
    queryKey: ['at-show', 'has-any-entry', personId, showId],
    queryFn: async () => {
      if (!personId) return false;
      const { data } = await getUserEntries(personId);
      return (data ?? []).some(row => (row as { show_id?: string }).show_id === showId);
    },
    enabled: !!personId && !!showId,
  });

  return { hasAnyEntryForShow: data ?? false, isLoading };
}
