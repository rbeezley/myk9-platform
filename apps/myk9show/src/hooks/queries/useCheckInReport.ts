import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { supabase } from '@/services/database/supabaseClient';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';

// Types
export interface CheckInEntryRow {
  id: string;
  dog_id: string;
  handler_id: string;
  check_in_status: string | null;
  armband_number: number | null;
  handler_first_name: string | null;
  handler_last_name: string | null;
  dog_call_name: string | null;
  dog_breed_name: string | null;
  class_id: string;
  element: string | null;
  level: string | null;
  section: string | null;
  trial_id: string;
  trial_date: string;
  trial_number: number;
}

export interface CheckInClassEntry {
  entryId: string;
  classId: string;
  className: string;
  checkInStatus: string;
  trialId: string;
}

export interface ExhibitorCheckInGroup {
  key: string;
  armbandNumber: number;
  handlerName: string;
  dogName: string;
  dogBreed: string;
  entries: CheckInClassEntry[];
  totalEntries: number;
  checkedInCount: number;
  summaryStatus: 'none' | 'partial' | 'checked-in';
}

// Pure Functions (exported for testing)
export const DAY_ABBREVS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildClassDisplayName(params: {
  element: string | null;
  level: string | null;
  section: string | null;
  trialDate: string;
  trialNumber: number;
}): string {
  const { element, level, section, trialDate, trialNumber } = params;
  const date = new Date(trialDate + 'T00:00:00');
  const dayAbbrev = DAY_ABBREVS[date.getDay()];
  const showSection = shouldShowSection({
    element: element ?? undefined,
    level: level ?? undefined,
    section: section ?? undefined,
  });
  const parts = [element, level, showSection ? section : null].filter(Boolean);
  return `${dayAbbrev} T${trialNumber}: ${parts.join(' ')}`;
}

export function deriveSummaryStatus(statuses: string[]): 'none' | 'partial' | 'checked-in' {
  const hasNone = statuses.some(s => s === 'no-status' || !s);
  const hasCheckedIn = statuses.some(s => s !== 'no-status' && !!s);
  if (hasNone && hasCheckedIn) return 'partial';
  if (hasCheckedIn) return 'checked-in';
  return 'none';
}

export function groupEntriesByExhibitor(rows: CheckInEntryRow[]): ExhibitorCheckInGroup[] {
  const map = new Map<
    string,
    {
      group: Omit<ExhibitorCheckInGroup, 'summaryStatus' | 'checkedInCount' | 'totalEntries'>;
      statuses: string[];
    }
  >();

  for (const row of rows) {
    const key = `${row.dog_id}:${row.handler_id}`;
    const status = row.check_in_status || 'no-status';
    if (!map.has(key)) {
      map.set(key, {
        group: {
          key,
          armbandNumber: row.armband_number ?? 0,
          handlerName:
            [row.handler_first_name, row.handler_last_name].filter(Boolean).join(' ') || 'Unknown',
          dogName: row.dog_call_name || 'Unknown',
          dogBreed: row.dog_breed_name || '',
          entries: [],
        },
        statuses: [],
      });
    }
    const item = map.get(key)!;
    item.group.entries.push({
      entryId: row.id,
      classId: row.class_id,
      className: buildClassDisplayName({
        element: row.element,
        level: row.level,
        section: row.section,
        trialDate: row.trial_date,
        trialNumber: row.trial_number,
      }),
      checkInStatus: status,
      trialId: row.trial_id,
    });
    item.statuses.push(status);
  }

  return Array.from(map.values())
    .map(({ group, statuses }) => ({
      ...group,
      totalEntries: statuses.length,
      checkedInCount: statuses.filter(s => s !== 'no-status' && !!s).length,
      summaryStatus: deriveSummaryStatus(statuses),
    }))
    .sort((a, b) => a.armbandNumber - b.armbandNumber);
}

// Query Function
async function fetchCheckInEntries(showId: string): Promise<CheckInEntryRow[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `id, dog_id, check_in_status, class_id,
      dog:dogs!inner(id, call_name, breed_name),
      handler:people!entries_handler_id_fkey(id, first_name, last_name),
      armband:armbands!inner(armband_number),
      class:classes!inner(id, element, level, section, trial:trials!inner(id, trial_date, trial_number, show_id))`
    )
    .eq('class.trial.show_id', showId)
    .is('deleted_at', null);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map(row => {
    const dog = row.dog as Record<string, unknown> | null;
    const handler = row.handler as Record<string, unknown> | null;
    const armband = row.armband as Record<string, unknown> | null;
    const cls = row.class as Record<string, unknown> | null;
    const trial = cls?.trial as Record<string, unknown> | null;
    return {
      id: row.id as string,
      dog_id: (dog?.id as string) ?? '',
      handler_id: (handler?.id as string) ?? '',
      check_in_status: (row.check_in_status as string) ?? 'no-status',
      armband_number: (armband?.armband_number as number) ?? null,
      handler_first_name: (handler?.first_name as string) ?? null,
      handler_last_name: (handler?.last_name as string) ?? null,
      dog_call_name: (dog?.call_name as string) ?? null,
      dog_breed_name: (dog?.breed_name as string) ?? null,
      class_id: (cls?.id as string) ?? '',
      element: (cls?.element as string) ?? null,
      level: (cls?.level as string) ?? null,
      section: (cls?.section as string) ?? null,
      trial_id: (trial?.id as string) ?? '',
      trial_date: (trial?.trial_date as string) ?? '',
      trial_number: (trial?.trial_number as number) ?? 1,
    };
  });
}

// Hook
export function useCheckInReport(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.checkInReport(showId ?? ''),
    queryFn: async () => {
      const rows = await fetchCheckInEntries(showId!);
      return groupEntriesByExhibitor(rows);
    },
    enabled: !!showId,
    ...cacheStrategies.realtime,
  });
}
