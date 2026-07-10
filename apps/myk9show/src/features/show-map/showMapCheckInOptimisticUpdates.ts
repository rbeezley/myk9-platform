import type { ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';
import type { ShowDayDetailRow } from '@/types/show-day-types';

export function markRowCheckedIn<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  entryId: string
) {
  if (!rows) return rows;
  return rows.map(row =>
    row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row
  ) as T[];
}

export function markShowDayDetailsCheckedIn(
  rows: ShowDayDetailRow[] | undefined,
  entryId: string
): ShowDayDetailRow[] | undefined {
  if (!rows) return rows;
  return rows.map(row => (row.id === entryId ? { ...row, check_in_status: 'checked-in' } : row));
}

export function markCheckInReportCheckedIn(
  groups: ExhibitorCheckInGroup[] | undefined,
  entryId: string
): ExhibitorCheckInGroup[] | undefined {
  if (!groups) return groups;
  return groups.map(group => {
    if (!group.entries.some(entry => entry.entryId === entryId)) return group;

    const entries = group.entries.map(entry =>
      entry.entryId === entryId ? { ...entry, checkInStatus: 'checked-in' } : entry
    );
    const checkedInCount = entries.filter(
      entry => entry.checkInStatus !== 'no-status' && !!entry.checkInStatus
    ).length;
    const allCheckedIn = checkedInCount === entries.length;
    const noneCheckedIn = checkedInCount === 0;

    return {
      ...group,
      entries,
      checkedInCount,
      summaryStatus: allCheckedIn ? 'checked-in' : noneCheckedIn ? 'none' : 'partial',
    };
  });
}
