import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useDogsQuery } from './useDogsDatabase';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import type { Database } from '@/types/supabase';

const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type LifetimeEntryViewRow = Database['public']['Views']['view_authenticated_entry_results']['Row'];

type LifetimeEntryRow = Pick<
  LifetimeEntryViewRow,
  | 'id'
  | 'dog_id'
  | 'dog_call_name'
  | 'show_id'
  | 'class_id'
  | 'class_name'
  | 'class_element'
  | 'class_level'
  | 'result_text'
  | 'search_time_seconds'
  | 'total_faults'
  | 'final_placement'
  | 'show_name'
  | 'show_start_date'
  | 'show_organization'
  | 'created_at'
>;

type LifetimeEntryIdentityRow = LifetimeEntryRow & {
  id: string;
  dog_id: string;
  show_id: string;
  class_id: string;
};

function assertLifetimeEntryIdentity(
  row: LifetimeEntryRow
): asserts row is LifetimeEntryIdentityRow {
  if (!row.id || !row.dog_id || !row.show_id || !row.class_id) {
    throw new Error('Lifetime analytics row is missing required identity fields');
  }
}

function normalizeResultText(value: string | null): StatsEntry['resultText'] {
  switch (value) {
    case 'Q':
    case 'NQ':
    case 'ABS':
    case 'EX':
    case 'WD':
      return value;
    default:
      return 'pending';
  }
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

  const rows: LifetimeEntryIdentityRow[] = [];
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

    const pageRows: LifetimeEntryRow[] = data ?? [];
    const validPageRows = pageRows.map(row => {
      assertLifetimeEntryIdentity(row);
      return row;
    });
    rows.push(...validPageRows);

    if (validPageRows.length < PAGE_SIZE) {
      complete = true;
      break;
    }

    const pageLastRow = validPageRows[validPageRows.length - 1];
    if (!pageLastRow) {
      throw new Error('Lifetime analytics page unexpectedly returned no rows');
    }
    lastId = pageLastRow.id;
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
    resultText: normalizeResultText(row.result_text),
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
