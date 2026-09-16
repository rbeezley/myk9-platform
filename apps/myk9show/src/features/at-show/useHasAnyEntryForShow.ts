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
 * same account-level entry source already used by My Shows.
 *
 * Reads through `useAccountEntries`, which owns the shared key, the retry and
 * the `networkMode` (MYK9-563 item 3); `showId` is a projection parameter, not
 * a cache dimension, so it lives in `select` rather than in the key.
 */
import { useCallback } from 'react';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';
import { useAccountEntries, type AccountEntriesRead } from '@/hooks/queries/useAccountEntries';

export interface HasAnyEntryForShow {
  hasAnyEntryForShow: boolean;
  isLoading: boolean;
  /**
   * The read failed and nobody could answer. `hasAnyEntryForShow` is `false`
   * here because a boolean has to be something — it is NOT a finding. Before
   * MYK9-563 this hook discarded `error` entirely and carried no retry, so a
   * non-offline view failure over an unreadable replica rendered as a confident
   * "you are not entered in this show" at ringside.
   */
  isError: boolean;
  /** Rows the authoritative view never confirmed — see `AccountEntriesRead`. */
  degraded: boolean;
}

export function useHasAnyEntryForShow(showId: string | undefined): HasAnyEntryForShow {
  const personId = useCurrentUserPersonId();

  const select = useCallback(
    (read: AccountEntriesRead) => ({
      hasAnyEntryForShow: read.rows.some(row => (row as { show_id?: string }).show_id === showId),
      degraded: read.degraded,
    }),
    [showId]
  );

  const { data, isLoading, isError } = useAccountEntries(personId, select, {
    enabled: !!showId,
  });

  return {
    hasAnyEntryForShow: data?.hasAnyEntryForShow ?? false,
    // Never loading without an identity and a show to load for; a disabled
    // query reports isLoading:true forever and would hang the access gate.
    isLoading: !!personId && !!showId && isLoading,
    // Same gate as isLoading: a query that was never enabled has not failed.
    isError: !!personId && !!showId && isError,
    degraded: data?.degraded ?? false,
  };
}
