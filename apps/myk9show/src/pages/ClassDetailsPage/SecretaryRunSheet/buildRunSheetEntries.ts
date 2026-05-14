import { isCheckInStatus, type CheckInStatus } from '@myk9/core';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { Dog } from '@/types/dog-types';
import type { RunSheetEntry, RunSheetResult, SortMode } from './types';
import { formatSearchTime } from './types';

function normalizeOrganization(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function registeredBreedForOrganization(
  row: RawEntryRow,
  dogLookup: Map<string, Dog>,
  organization: string | null | undefined
): string | null {
  const normalizedOrg = normalizeOrganization(organization);
  const storeDog = dogLookup.get(row.dog_id);
  const matchingStoreRegistration = storeDog?.registrations?.find(
    registration => normalizeOrganization(registration.organization) === normalizedOrg
  );
  if (matchingStoreRegistration?.breed) return matchingStoreRegistration.breed;

  const matchingRawRegistration = row.dog?.registrations?.find(
    registration => normalizeOrganization(registration.organization) === normalizedOrg
  );
  if (matchingRawRegistration?.breed) return matchingRawRegistration.breed;

  return row.dog?.breed ?? storeDog?.breed ?? null;
}

function readCheckInStatus(value: string | null): CheckInStatus {
  return value && isCheckInStatus(value) ? value : 'no-status';
}

function rawToEntry(
  row: RawEntryRow,
  dogLookup: Map<string, Dog>,
  organization: string | null | undefined
): RunSheetEntry {
  const dog = row.dog;
  const dogName = dog?.call_name ?? dog?.name ?? 'Unknown Dog';
  const owner = dog?.owner;
  const ownerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '';
  const handlerName = row.handler?.trim() || ownerName;

  const checkInStatus = readCheckInStatus(row.check_in_status);
  const isCheckedIn = checkInStatus === 'checked-in';
  const isScratched = checkInStatus === 'pulled';
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
    breed: registeredBreedForOrganization(row, dogLookup, organization),
    handlerName,
    ownerName,
    checkInStatus,
    isCheckedIn,
    isScratched,
    isScored,
    result,
  };
}

export function buildRunSheetEntries(
  rows: RawEntryRow[],
  sortMode: SortMode,
  dogLookup: Map<string, Dog> = new Map(),
  organization?: string | null
): RunSheetEntry[] {
  const entries = rows.map(row => rawToEntry(row, dogLookup, organization));
  if (sortMode === 'armband-asc' || sortMode === 'armband-desc') {
    const withParsed = entries.map(e => ({ e, n: parseInt(e.armband, 10) }));
    withParsed.sort((a, b) => (sortMode === 'armband-asc' ? a.n - b.n : b.n - a.n));
    return withParsed.map(({ e }) => e);
  }
  if (sortMode === 'random') {
    return [...entries].sort(() => Math.random() - 0.5);
  }
  return [...entries].sort((a, b) => a.runOrder - b.runOrder);
}
