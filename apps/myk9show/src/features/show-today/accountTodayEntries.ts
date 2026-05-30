import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export const accountTodayEntriesQueryKey = (userId: string | undefined) =>
  ['account-today-entries', userId ?? 'anonymous'] as const;

interface UseAccountTodayEntriesOptions {
  enabled?: boolean;
}

export async function fetchAccountTodayEntryIds(): Promise<AccountTodayEntryId[]> {
  const { data, error } = await supabase.rpc('get_account_today_entries');
  if (error) throw error;
  return data ?? [];
}

export async function fetchHydratedAccountTodayEntries(): Promise<HydratedAccountTodayEntry[]> {
  const accountEntryIds = await fetchAccountTodayEntryIds();
  if (accountEntryIds.length === 0) return [];

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
    const invalidate = () => void queryClient.invalidateQueries({ queryKey });
    const unsubscribes = [
      replicatedEntriesTable.subscribe(invalidate),
      replicatedClassesTable.subscribe(invalidate),
      replicatedTrialsTable.subscribe(invalidate),
      replicatedShowsTable.subscribe(invalidate),
    ];
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, [enabled, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: fetchHydratedAccountTodayEntries,
    enabled,
    staleTime: 60_000,
  });
}

export function usePreFavoriteAccountTodayEntries() {
  const accountEntries = useAccountTodayEntries();

  return useCallback(
    async (showId: string): Promise<boolean> => {
      const entries = accountEntries.data ?? (await fetchHydratedAccountTodayEntries());
      return persistAccountTodayClassFavorites(showId, entries);
    },
    [accountEntries.data]
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
