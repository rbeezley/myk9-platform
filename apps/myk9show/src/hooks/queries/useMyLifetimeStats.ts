import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

interface LifetimeEntryRow {
  id: string;
  dog_id: string;
  dog_call_name: string | null;
  show_id: string;
  class_id: string;
  class_name: string | null;
  class_element: string | null;
  class_level: string | null;
  result_text: StatsEntry['resultText'] | null;
  search_time_seconds: number | null;
  total_faults: number | null;
  final_placement: number | null;
  show_name: string | null;
  show_start_date: string | null;
  show_organization: string | null;
  created_at: string | null;
}

const LIFETIME_ENTRY_SELECT = `
  id,
  dog_id,
  dog_call_name,
  show_id,
  class_id,
  class_name,
  class_element,
  class_level,
  result_text,
  search_time_seconds,
  total_faults,
  final_placement,
  show_name,
  show_start_date,
  show_organization,
  created_at
`;

async function fetchMyLifetimeEntries(dogIds: string[]): Promise<StatsEntry[]> {
  if (dogIds.length === 0) return [];

  const rows: LifetimeEntryRow[] = [];
  let lastId: string | undefined;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase
      .from('view_authenticated_entry_results')
      .select(LIFETIME_ENTRY_SELECT)
      .in('dog_id', dogIds);

    if (lastId !== undefined) {
      query = query.gt('id', lastId);
    }

    const { data, error } = await query.order('id', { ascending: true }).limit(PAGE_SIZE);

    if (error) throw error;

    const pageRows = (data ?? []) as LifetimeEntryRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      complete = true;
      break;
    }

    lastId = String(pageRows[pageRows.length - 1]!.id);
  }

  if (!complete) {
    throw new Error(`Lifetime analytics exceeded the ${MAX_PAGES * PAGE_SIZE} entry safety limit`);
  }

  rows.sort((left, right) => {
    const createdAtComparison = String(right.created_at ?? '').localeCompare(
      String(left.created_at ?? '')
    );
    if (createdAtComparison !== 0) return createdAtComparison;
    return String(right.id).localeCompare(String(left.id));
  });

  return rows.map((row): StatsEntry => ({
    id: row.id,
    dogId: row.dog_id,
    dogCallName: row.dog_call_name || '',
    showId: row.show_id,
    showName: row.show_name || 'Unknown Show',
    showDate: row.show_start_date || '',
    classId: row.class_id,
    className: row.class_name || 'Unknown Class',
    classElement: row.class_element,
    classLevel: row.class_level,
    resultText: row.result_text || 'pending',
    searchTimeSeconds: row.search_time_seconds,
    totalFaults: row.total_faults,
    finalPlacement: row.final_placement,
    organization: row.show_organization || undefined,
  }));
}

export function useMyLifetimeStats() {
  const { data: dogs = [] } = useDogsQuery();
  const dogIds = dogs.map((d: Record<string, unknown>) => d.id as string);
  const sortedIds = dogIds.slice().sort();

  return useQuery({
    queryKey: [...queryKeys.myLifetimeStats(), sortedIds],
    queryFn: () => fetchMyLifetimeEntries(dogIds),
    enabled: dogIds.length > 0,
    ...cacheStrategies.moderate,
  });
}
