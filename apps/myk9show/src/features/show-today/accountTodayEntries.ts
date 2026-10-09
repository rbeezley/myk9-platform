import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import {
  hydrateAccountTodayEntriesFromReplicatedRows,
  persistAccountTodayClassFavorites,
  type AccountTodayEntryId,
} from './accountTodayEntries.helpers';
import type { HydratedAccountTodayEntry } from './showTodayBanner.helpers';
import { createAccountTodayEntriesSubscriptionRegistry } from './accountTodayEntriesSubscriptions';

export const accountTodayEntriesQueryKey = (userId: string | undefined) =>
  ['account-today-entries', userId ?? 'anonymous'] as const;

const accountTodaySubscriptions = createAccountTodayEntriesSubscriptionRegistry([
  replicatedEntriesTable,
  replicatedClassesTable,
  replicatedTrialsTable,
  replicatedShowsTable,
]);

/**
 * The server's list of entry ids is its own query, apart from the hydrated rows.
 * Replica writes during a sync (entries, classes, trials, shows land apart)
 * only change how those ids hydrate, so they re-run the hydration, never the
 * RPC (MYK9-1066: a class page issued 6 RPC calls in 2 s). The RPC re-runs when
 * ids go stale (60 s), which also covers an entry placed elsewhere. The key sits
 * outside the hydrated key's prefix, which the subscriptions invalidate.
 */
const accountTodayIdsQueryKey = (userId: string | undefined) =>
  ['account-today-entry-ids', userId ?? 'anonymous'] as const;

const ACCOUNT_TODAY_STALE_MS = 60_000;

interface UseAccountTodayEntriesOptions {
  enabled?: boolean;
}

export async function fetchAccountTodayEntryIds(): Promise<AccountTodayEntryId[]> {
  const { data, error } = await supabase.rpc('get_account_today_entries');
  if (error) throw error;
  return data ?? [];
}

export async function fetchHydratedAccountTodayEntries(
  queryClient: QueryClient,
  userId: string | undefined
): Promise<HydratedAccountTodayEntry[]> {
  const accountEntryIds = await queryClient.fetchQuery({
    queryKey: accountTodayIdsQueryKey(userId),
    queryFn: fetchAccountTodayEntryIds,
    staleTime: ACCOUNT_TODAY_STALE_MS,
  });
  if (accountEntryIds.length === 0) return [];

  // MYK9-774: getAll() on purpose — the server RPC already named every entry,
  // and hydrateAccountTodayEntriesFromReplicatedRows falls back to the RPC row's
  // own fields for anything the device cannot supply, so [] only loses detail.
  const [entries, classes, trials, shows] = await Promise.all([
    replicatedEntriesTable.getAll(),
    replicatedClassesTable.getAll(),
    replicatedTrialsTable.getAll(),
    replicatedShowsTable.getAll(),
  ]);

  return hydrateAccountTodayEntriesFromReplicatedRows(accountEntryIds, {
    entries,
    classes,
    trials,
    shows,
  });
}

export function useAccountTodayEntries(options: UseAccountTodayEntriesOptions = {}) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const enabled = (options.enabled ?? true) && !!user;
  const queryKey = useMemo(() => accountTodayEntriesQueryKey(user?.id), [user?.id]);

  useEffect(() => {
    if (!enabled) return;
    return accountTodaySubscriptions.retain(queryClient, queryKey);
  }, [enabled, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => fetchHydratedAccountTodayEntries(queryClient, user?.id),
    enabled,
    staleTime: ACCOUNT_TODAY_STALE_MS,
  });
}

export function usePreFavoriteAccountTodayEntries() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const accountEntries = useAccountTodayEntries();

  return useCallback(
    async (showId: string): Promise<boolean> => {
      const entries =
        accountEntries.data ?? (await fetchHydratedAccountTodayEntries(queryClient, user?.id));
      return persistAccountTodayClassFavorites(showId, entries);
    },
    [accountEntries.data, queryClient, user?.id]
  );
}

export function useAccountTodayAutoFavorites(showId: string | undefined) {
  const queryClient = useQueryClient();
  const accountEntries = useAccountTodayEntries({ enabled: !!showId });
  const showEntries = useMemo(
    () => (showId ? (accountEntries.data ?? []).filter(entry => entry.showId === showId) : []),
    [accountEntries.data, showId]
  );
  const hasAccountEntryForShow = showEntries.length > 0;

  useEffect(() => {
    if (!showId || showEntries.length === 0) return;
    const changed = persistAccountTodayClassFavorites(showId, showEntries);
    if (changed) {
      void queryClient.invalidateQueries({ queryKey: ['at-show', 'classlist', showId] });
    }
  }, [queryClient, showEntries, showId]);

  return {
    hasAccountEntryForShow,
    isLoading: accountEntries.isLoading,
    error: accountEntries.error as Error | null,
  };
}
