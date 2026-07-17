import { describe, it, expect } from 'vitest';
import {
  mapDbClassToScentWorkConfig,
  mapDbEntryToScentWorkEntry,
  extractScentWorkResult,
  mapScentWorkResultToDbUpdate,
  mapDbEntryToUnifiedEntry,
  type DbEntryWithDog,
  type DbClassForScoring,
} from './scoringMappers';
import type { ScentWorkResult } from '@/types/scent-work-types';

function makeDbClass(overrides: Partial<DbClassForScoring> = {}): DbClassForScoring {
  return {
    id: 'class-1',
    name: 'Novice Container',
    class_number: '1',
    element: 'Container',
    level: 'Novice',
    time_limit_seconds: null,
    num_areas: null,
    num_hides: null,
    ...overrides,
  };
}

function makeDbEntry(overrides: Partial<DbEntryWithDog> = {}): DbEntryWithDog {
  return {
    id: 'entry-1',
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    handler: 'Handler One',
    handler_id: 'handler-1',
    armband: '101',
    entry_status: 'confirmed',
    entry_fee: 25,
    payment_status: 'paid',
    run_order: 3,
    special_requests: null,
    submitted_at: '2026-06-01T10:00:00.000Z',
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    check_in_status: null,
    result_status: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    is_scored: false,
    is_in_ring: false,
    scoring_started_at: null,
    scoring_completed_at: null,
    disqualification_reason: null,
    dog: {
      id: 'dog-1',
      name: 'Rex the Great',
      call_name: 'Rex',
      breed: 'Border Collie',
      owner: { id: 'owner-1', first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com' },
    },
    ...overrides,
  };
}

describe('mapDbClassToScentWorkConfig', () => {
  it('defaults element to Container and level to Novice when missing', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ element: null, level: null }));

    expect(config.element).toBe('Container');
    expect(config.level).toBe('Novice');
  });

  it('uses explicit time_limit_seconds converted to milliseconds when provided', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ time_limit_seconds: 90 }));

    expect(config.timeLimit).toBe(90000);
  });

  it('disables warnings for Masters level', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ level: 'Masters' }));

    expect(config.warningsEnabled).toBe(false);
  });

  it('enables warnings for non-Masters levels', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ level: 'Novice' }));

    expect(config.warningsEnabled).toBe(true);
  });

  it('passes through hideCount when provided', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ num_hides: 3 }));

    expect(config.hideCount).toBe(3);
  });

  it('leaves hideCount undefined when num_hides is null', () => {
    const config = mapDbClassToScentWorkConfig(makeDbClass({ num_hides: null }));

    expect(config.hideCount).toBeUndefined();
  });
});

describe('mapDbEntryToScentWorkEntry', () => {
  const classConfig = mapDbClassToScentWorkConfig(makeDbClass());

  it('maps dog display info, preferring call_name over name', () => {
    const entry = mapDbEntryToScentWorkEntry(makeDbEntry(), classConfig);

    expect(entry.displayInfo.dogName).toBe('Rex');
    expect(entry.displayInfo.dogBreed).toBe('Border Collie');
    expect(entry.displayInfo.armband).toBe('101');
  });

  it('falls back to dog.name when call_name is missing', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({
        dog: { id: 'dog-1', name: 'Rex the Great', call_name: null, breed: null, owner: null },
      }),
      classConfig
    );

    expect(entry.displayInfo.dogName).toBe('Rex the Great');
  });

  it('falls back to "Unknown Dog" when there is no dog relation', () => {
    const entry = mapDbEntryToScentWorkEntry(makeDbEntry({ dog: null }), classConfig);

    expect(entry.displayInfo.dogName).toBe('Unknown Dog');
  });

  it('derives handler name from owner when handler field is blank', () => {
    const entry = mapDbEntryToScentWorkEntry(makeDbEntry({ handler: null }), classConfig);

    expect(entry.registrationData.handler).toBe('Jane Doe');
    expect(entry.displayInfo.handlerName).toBe('Jane Doe');
  });

  it('falls back to "confirmed" for an unrecognized entry_status', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({ entry_status: 'bogus-status' }),
      classConfig
    );

    expect(entry.status).toBe('confirmed');
  });

  it('preserves a valid entry_status', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({ entry_status: 'withdrawn' }),
      classConfig
    );

    expect(entry.status).toBe('withdrawn');
  });

  it('maps check_in_status values, defaulting to no-status', () => {
    expect(
      mapDbEntryToScentWorkEntry(makeDbEntry({ check_in_status: 'checked-in' }), classConfig)
        .checkInStatus
    ).toBe('checked-in');
    expect(
      mapDbEntryToScentWorkEntry(makeDbEntry({ check_in_status: 'unrecognized' }), classConfig)
        .checkInStatus
    ).toBe('no-status');
  });

  it('marks judgingState in-progress when timer started but not completed', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({ scoring_started_at: '2026-06-01T11:00:00.000Z', scoring_completed_at: null }),
      classConfig
    );

    expect(entry.judgingState).toEqual({
      timerStarted: new Date('2026-06-01T11:00:00.000Z'),
      isInProgress: true,
    });
  });

  it('leaves judgingState undefined when scoring has not started', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({ scoring_started_at: null, scoring_completed_at: null }),
      classConfig
    );

    expect(entry.judgingState).toBeUndefined();
  });

  it('leaves judgingState undefined once scoring has completed', () => {
    const entry = mapDbEntryToScentWorkEntry(
      makeDbEntry({
        scoring_started_at: '2026-06-01T11:00:00.000Z',
        scoring_completed_at: '2026-06-01T11:05:00.000Z',
      }),
      classConfig
    );

    expect(entry.judgingState).toBeUndefined();
  });
});

describe('extractScentWorkResult', () => {
  it('returns undefined when the entry has not been scored and has no search time', () => {
    const result = extractScentWorkResult(
      makeDbEntry({ is_scored: false, search_time_seconds: null }),
      60000
    );

    expect(result).toBeUndefined();
  });

  it('extracts a result once is_scored is true', () => {
    const result = extractScentWorkResult(
      makeDbEntry({
        is_scored: true,
        search_time_seconds: 42,
        total_faults: 1,
        result_status: 'Qualified',
        scoring_completed_at: '2026-06-01T11:05:00.000Z',
        final_placement: 2,
      }),
      60000
    );

    expect(result).toBeDefined();
    expect(result?.searchTime).toBe(42000);
    expect(result?.faults).toBe(1);
    expect(result?.qualification).toBe('Qualified');
    expect(result?.isProvisional).toBe(false);
    expect(result?.placementCalculated).toBe(2);
  });

  it('marks the result provisional when scoring_completed_at is missing', () => {
    const result = extractScentWorkResult(
      makeDbEntry({ is_scored: true, search_time_seconds: 10, scoring_completed_at: null }),
      60000
    );

    expect(result?.isProvisional).toBe(true);
  });

  it('defaults an unrecognized result_status to Not Qualified', () => {
    const result = extractScentWorkResult(
      makeDbEntry({ is_scored: true, search_time_seconds: 10, result_status: 'weird' }),
      60000
    );

    expect(result?.qualification).toBe('Not Qualified');
  });
});

describe('mapScentWorkResultToDbUpdate', () => {
  it('converts searchTime back to seconds and maps core scoring fields', () => {
    const result: ScentWorkResult = {
      entryId: 'entry-1',
      classId: 'class-1',
      searchTime: 45000,
      maxTimeAllowed: 60000,
      qualification: 'Qualified',
      faults: 0,
      recordedBy: 'judge-1',
      recordedAt: new Date('2026-06-01T11:05:00.000Z'),
      placementCalculated: 1,
    };

    const update = mapScentWorkResultToDbUpdate(result);

    expect(update.search_time_seconds).toBe(45);
    expect(update.total_faults).toBe(0);
    expect(update.result_status).toBe('Qualified');
    expect(update.is_scored).toBe(true);
    expect(update.scoring_completed_at).toBe('2026-06-01T11:05:00.000Z');
    expect(update.final_placement).toBe(1);
    expect(update.entry_status).toBe('completed');
  });

  it('nulls out optional fields when absent', () => {
    const result: ScentWorkResult = {
      entryId: 'entry-1',
      classId: 'class-1',
      searchTime: 0,
      maxTimeAllowed: 60000,
      qualification: 'Not Qualified',
      faults: 3,
      recordedBy: 'judge-1',
      recordedAt: new Date('2026-06-01T11:05:00.000Z'),
    };

    const update = mapScentWorkResultToDbUpdate(result);

    expect(update.judge_notes).toBeNull();
    expect(update.disqualification_reason).toBeNull();
    expect(update.final_placement).toBeNull();
  });
});

describe('mapDbEntryToUnifiedEntry', () => {
  it('marks unscored entries as Pending', () => {
    const entry = mapDbEntryToUnifiedEntry(makeDbEntry({ is_scored: false }));

    expect(entry.status).toBe('Pending');
    expect(entry.isProvisional).toBe(true);
  });

  it('maps result_status to the unified status once scored', () => {
    const entry = mapDbEntryToUnifiedEntry(
      makeDbEntry({
        is_scored: true,
        result_status: 'Qualified',
        scoring_completed_at: '2026-06-01T11:05:00.000Z',
      })
    );

    expect(entry.status).toBe('Qualified');
    expect(entry.isProvisional).toBe(false);
  });

  it('falls back to dog.name and "Unknown Dog" the same way as the entry mapper', () => {
    const entry = mapDbEntryToUnifiedEntry(makeDbEntry({ dog: null }));

    expect(entry.dog).toBe('Unknown Dog');
  });
});
