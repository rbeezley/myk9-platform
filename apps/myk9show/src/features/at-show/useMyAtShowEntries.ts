import { useEffect, useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useAccountTodayEntries } from '@/features/show-today/accountTodayEntries';
import {
  deriveMyAtShowEntrySets,
  persistMyAtShowEntries,
  readMyAtShowEntries,
} from './myAtShowEntries.helpers';

export interface MyAtShowEntries {
  /** Entry ids belonging to the signed-in account (handler, owner, or co-owner). */
  ownEntryIds: ReadonlySet<string>;
  /** Classes containing at least one of those entries. */
  ownClassIds: ReadonlySet<string>;
  isLoading: boolean;
}

const EMPTY: MyAtShowEntries = {
  ownEntryIds: new Set<string>(),
  ownClassIds: new Set<string>(),
  isLoading: false,
};

/**
 * Ownership sets for the at-show surfaces ("highlight MY dogs").
 *
 * Source of truth is the `get_account_today_entries` RPC (already fetched at
 * the at-show access gate); the latest result is persisted per (show, user) to
 * localStorage so a cold offline start still highlights — same offline posture
 * as the auto-favorites that ride the same query.
 */
export function useMyAtShowEntries(showId: string | undefined): MyAtShowEntries {
  const { user } = useAuthContext();
  const userId = user?.id;
  const accountEntries = useAccountTodayEntries({ enabled: !!showId && !!userId });

  const fresh = useMemo(() => {
    if (!showId || !accountEntries.data) return null;
    return deriveMyAtShowEntrySets(accountEntries.data, showId);
  }, [accountEntries.data, showId]);

  useEffect(() => {
    if (!showId || !userId || !fresh) return;
    persistMyAtShowEntries(showId, userId, fresh);
  }, [fresh, showId, userId]);

  return useMemo(() => {
    if (!showId || !userId) return EMPTY;
    const sets = fresh ?? readMyAtShowEntries(showId, userId);
    return {
      ownEntryIds: new Set(sets.entryIds),
      ownClassIds: new Set(sets.classIds),
      isLoading: !fresh && accountEntries.isLoading,
    };
  }, [accountEntries.isLoading, fresh, showId, userId]);
}
