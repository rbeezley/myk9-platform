import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { RunSheetEntry, RunSheetResult, SortMode } from './types';
import { formatSearchTime } from './types';

function rawToEntry(row: RawEntryRow): RunSheetEntry {
  const dog = row.dog;
  const dogName = dog?.call_name ?? dog?.name ?? 'Unknown Dog';
  const owner = dog?.owner;
  const ownerName = owner
    ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim()
    : '';

  const isCheckedIn = row.check_in_status === 'checked-in';
  const isScratched = row.check_in_status === 'pulled';
  const isScored = row.is_scored === true;

  let result: RunSheetResult | null = null;
  if (isScored) {
    result = {
      qualified: row.result_status === 'qualified',
      timeStr: row.search_time_seconds != null ? formatSearchTime(row.search_time_seconds) : '',
      faults: row.total_faults ?? 0,
      placement: row.final_placement && row.final_placement > 0 ? row.final_placement : null,
      judgeNotes: row.judge_notes ?? '',
    };
  }

  return {
    id: row.id,
    runOrder: row.run_order ?? 0,
    dogName,
    armband: row.armband ?? '',
    breed: dog?.breed ?? null,
    ownerName,
    isCheckedIn,
    isScratched,
    isScored,
    result,
  };
}

export function buildRunSheetEntries(rows: RawEntryRow[], sortMode: SortMode): RunSheetEntry[] {
  const entries = rows.map(rawToEntry);
  if (sortMode === 'armband-asc') {
    return [...entries].sort((a, b) => parseInt(a.armband, 10) - parseInt(b.armband, 10));
  }
  if (sortMode === 'armband-desc') {
    return [...entries].sort((a, b) => parseInt(b.armband, 10) - parseInt(a.armband, 10));
  }
  if (sortMode === 'random') {
    return [...entries].sort(() => Math.random() - 0.5);
  }
  return [...entries].sort((a, b) => a.runOrder - b.runOrder);
}
