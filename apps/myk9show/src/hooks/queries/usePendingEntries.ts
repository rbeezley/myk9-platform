import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';

export interface PendingEntry {
  id: string;
  showId: string;
  showName: string;
  className: string;
  handlerName: string;
  dogName: string;
  submittedAt: string;
}

export const PENDING_ENTRIES_KEY = 'pending-entries';

function toEntry(row: Record<string, unknown>): PendingEntry {
  const person = row.people as { first_name: string; last_name: string } | null;
  const dog = row.dogs as { call_name: string } | null;
  const cls = row.classes as { name: string } | null;
  const show = row.shows as { name: string } | null;
  return {
    id: row.id as string,
    showId: row.show_id as string,
    showName: show?.name ?? '',
    className: cls?.name ?? '',
    handlerName: person ? `${person.first_name} ${person.last_name}` : '',
    dogName: dog?.call_name ?? '',
    submittedAt: (row.submitted_at ?? row.created_at) as string,
  };
}

export function usePendingEntries(showIdFilter?: string) {
  return useQuery({
    queryKey: [PENDING_ENTRIES_KEY, showIdFilter ?? 'all'],
    queryFn: async () => {
      let query = supabase
        .from('entries')
        .select(
          'id, show_id, submitted_at, dogs(call_name), people(first_name, last_name), classes(name), shows(name)'
        )
        .eq('entry_status', 'submitted');

      if (showIdFilter && showIdFilter !== 'all') {
        query = query.eq('show_id', showIdFilter);
      }

      const { data, error } = await query.order('submitted_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(toEntry);
    },
  });
}
