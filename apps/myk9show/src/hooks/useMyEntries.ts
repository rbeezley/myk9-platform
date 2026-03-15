import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

interface MyEntryByClass {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
}

export interface UseMyEntriesResult {
  entries: Array<{ id: string; showId: string }>;
  entriesByClass: MyEntryByClass[];
  isLoading: boolean;
  isError: boolean;
}

async function fetchMyEntries(showId: string, personId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id, class_id, armband, run_order, is_scored, entry_status, show_id,
      dog:dog_id (id, call_name),
      class:class_id (id, name, scored_count, total_entries_count)
    `
    )
    .eq('show_id', showId)
    .eq('handler_id', personId)
    .is('deleted_at', null)
    .order('run_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function useMyEntries(showId: string | undefined): UseMyEntriesResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId;

  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.entriesByShow(showId || ''), 'mine', personId],
    queryFn: () => fetchMyEntries(showId!, personId!),
    enabled: !!showId && !!personId,
    ...cacheStrategies.dynamic,
    refetchInterval: 30_000, // 30s polling for live show-day updates
  });

  const { entries, entriesByClass } = useMemo(() => {
    const rawEntries = data || [];

    const entryList = rawEntries.map((e) => ({ id: e.id, showId: String(e.show_id) }));

    const byClass: MyEntryByClass[] = rawEntries.map((entry) => {
      const cls = entry.class as Record<string, unknown> | null;
      const dog = entry.dog as Record<string, unknown> | null;
      const scoredCount = (cls?.scored_count as number) || 0;
      const runOrder = (entry.run_order as number) || 0;
      const dogsAhead = Math.max(0, runOrder - scoredCount - 1);

      return {
        classId: String(entry.class_id),
        className: String(cls?.name || 'Unknown Class'),
        dogName: String(dog?.call_name || 'Unknown Dog'),
        armband: String(entry.armband || ''),
        runOrder,
        dogsAhead,
        scored: Boolean(entry.is_scored),
      };
    });

    return { entries: entryList, entriesByClass: byClass };
  }, [data]);

  return { entries, entriesByClass, isLoading, isError };
}
