import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { ScoringRow } from '../types';

export function makeRow(overrides: Partial<ScoringRow> = {}): ScoringRow {
  return {
    entryId: 'e1',
    armband: '101',
    dogName: 'Rex',
    dogBreed: 'Labrador',
    handlerName: 'Alice Smith',
    qualification: '',
    qualificationReason: '',
    searchTime: '',
    faults: '0',
    placement: null,
    isScored: false,
    ...overrides,
  };
}

export function makeRawRow(id: string, overrides: Partial<RawEntryRow> = {}): RawEntryRow {
  return {
    id,
    class_id: 'cls-1',
    show_id: 'show-1',
    dog_id: `dog-${id}`,
    handler_id: null,
    armband: '',
    handler: null,
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: 'no-status',
    run_order: 1,
    dog: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  } satisfies RawEntryRow;
}

export function makeScentEntry(
  id: string,
  armband: string,
  dogName: string,
  handlerName: string
): ScentWorkEntry {
  return {
    id,
    displayInfo: {
      armband,
      dogName,
      dogBreed: 'Unknown',
      handlerName,
      dogId: `dog-${id}`,
      handlerId: `handler-${id}`,
    },
    classConfig: {} as ScentWorkClassConfig,
    checkInStatus: 'no-status',
  } as ScentWorkEntry;
}
