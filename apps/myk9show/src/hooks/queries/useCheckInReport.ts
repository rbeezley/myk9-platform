import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { shouldShowSection } from '@/components/classes/ClassDetailsMain.helpers';
import { fetchReplicatedCheckInEntries } from './useCheckInReportReplication';

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

// Hook
export function useCheckInReport(showId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.checkInReport(showId ?? ''),
    queryFn: async () => {
      const rows = await fetchReplicatedCheckInEntries(showId!);
      return groupEntriesByExhibitor(rows);
    },
    enabled: !!showId,
    ...cacheStrategies.realtime,
  });
}
