import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { EntryDisplayStatus } from '@/constants/live-status-config';

export interface ClassEntry {
  id: string;
  armband: string;
  dogName: string;
  breed: string;
  handlerName: string;
  status: EntryDisplayStatus;
  isCurrentUser: boolean;
  dogsAhead?: number;
  result?: string;
  time?: string;
  runOrder: number;
}

interface UseClassEntriesResult {
  pending: ClassEntry[];
  completed: ClassEntry[];
  isLoading: boolean;
  isError: boolean;
}

function mapEntryStatus(entry: Record<string, unknown>): EntryDisplayStatus {
  if (entry.is_scored) return 'completed';
  if (entry.is_in_ring) return 'in_ring';
  const entryStatus = String(entry.entry_status || '');
  if (entryStatus === 'scratched' || entryStatus === 'withdrawn') return 'pulled';
  if (entryStatus === 'competing') return 'at_gate';
  if (entryStatus === 'confirmed' || entryStatus === 'scheduled') return 'checked_in';
  return 'not_checked_in';
}

async function fetchClassEntries(classId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id, armband, run_order, is_scored, result_status, entry_status, is_in_ring, handler_id,
      dog:dog_id (id, call_name, breed),
      handler:handler_id (id, first_name, last_name)
    `
    )
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('run_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function useClassEntries(classId: string | undefined): UseClassEntriesResult {
  const { userWithRoles } = useAuthContext();
  const personId = userWithRoles?.databaseUserId;

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.classEntries(classId || ''),
    queryFn: () => fetchClassEntries(classId!),
    enabled: !!classId,
    ...cacheStrategies.dynamic,
    refetchInterval: 30_000, // 30s polling for live show-day updates
  });

  const { pending, completed } = useMemo(() => {
    const rawEntries = data || [];

    const allEntries: ClassEntry[] = rawEntries.map(entry => {
      const dog = entry.dog as Record<string, unknown> | null;
      const handler = entry.handler as Record<string, unknown> | null;
      const status = mapEntryStatus(entry as Record<string, unknown>);
      const isCurrentUser = personId ? String(entry.handler_id) === personId : false;
      const firstName = String(handler?.first_name || '');
      const lastName = String(handler?.last_name || '');
      const handlerName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';

      const base: ClassEntry = {
        id: entry.id,
        armband: String(entry.armband || ''),
        dogName: String(dog?.call_name || 'Unknown'),
        breed: String(dog?.breed || ''),
        handlerName,
        status,
        isCurrentUser,
        runOrder: (entry.run_order as number) || 0,
      };
      if (entry.is_scored && entry.result_status) {
        base.result = String(entry.result_status);
      }
      return base;
    });

    const pendingEntries = allEntries.filter(e => e.status !== 'completed');
    const completedEntries = allEntries.filter(e => e.status === 'completed');

    // Calculate dogsAhead for each pending entry
    const pendingWithPosition = pendingEntries.map(entry => {
      // Count entries ahead: entries with lower runOrder that are still pending
      const ahead = pendingEntries.filter(e => e.runOrder < entry.runOrder).length;
      return { ...entry, dogsAhead: ahead };
    });

    // Pin in-ring entry to top
    const sorted = [...pendingWithPosition].sort((a, b) => {
      if (a.status === 'in_ring' && b.status !== 'in_ring') return -1;
      if (b.status === 'in_ring' && a.status !== 'in_ring') return 1;
      return a.runOrder - b.runOrder;
    });

    return { pending: sorted, completed: completedEntries };
  }, [data, personId]);

  return { pending, completed, isLoading, isError };
}
