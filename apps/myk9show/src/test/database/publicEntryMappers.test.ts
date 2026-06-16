import { describe, expect, it } from 'vitest';
import type { PublicEntryRow } from '@/services/database/entries';
import { publicRowToRawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { publicRowToTrialEntryRow } from '@/hooks/queries/useTrialEntries';
import { publicRowToShowEntryRow } from '@/components/shows/ShowDetails/entriesTabMappers';

/**
 * The public view has already gated scored columns at the database (withheld →
 * NULL). These mappers must pass that gating through faithfully and must never
 * fabricate owner/PII the anon view does not carry.
 */
function makeRow(overrides: Partial<PublicEntryRow> = {}): PublicEntryRow {
  return {
    id: 'entry-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: '42',
    handler: 'Pat Handler',
    run_order: 3,
    is_in_ring: false,
    is_scored: true,
    check_in_status: 'checked_in',
    entry_status: 'confirmed',
    scoring_completed_at: '2026-06-16T10:00:00Z',
    created_at: '2026-06-01T10:00:00Z',
    final_placement: null,
    result_status: null,
    search_time_seconds: null,
    total_score: null,
    total_faults: null,
    result_text: 'pending',
    dog_name: 'Ranger',
    dog_call_name: 'Rae',
    dog_breed: 'Border Collie',
    dog_image_url: null,
    class_name: 'Container Novice A',
    class_level: 'Novice',
    class_element: 'Container',
    class_results_released_at: null,
    ...overrides,
  };
}

describe('public entry mappers', () => {
  it('passes through DB-gated NULL scored columns (withheld results stay hidden)', () => {
    const row = publicRowToRawEntryRow(makeRow());
    expect(row.final_placement).toBeNull();
    expect(row.result_status).toBeNull();
    expect(row.search_time_seconds).toBeNull();
    expect(row.total_faults).toBeNull();
  });

  it('passes through released scored columns when the DB exposed them', () => {
    const row = publicRowToRawEntryRow(
      makeRow({ final_placement: 1, result_status: 'qualified', search_time_seconds: 91.4 })
    );
    expect(row.final_placement).toBe(1);
    expect(row.result_status).toBe('qualified');
    expect(row.search_time_seconds).toBe(91.4);
  });

  it('never exposes owner/PII the anon view does not carry', () => {
    expect(publicRowToRawEntryRow(makeRow()).dog?.owner).toBeNull();
    expect(publicRowToRawEntryRow(makeRow()).judge_notes).toBeNull();
    expect(publicRowToTrialEntryRow(makeRow()).dog?.owner).toBeNull();
    expect(publicRowToTrialEntryRow(makeRow()).promo_code).toBeNull();
    expect(publicRowToShowEntryRow(makeRow()).dog?.owner).toBeNull();
    expect(publicRowToShowEntryRow(makeRow()).payment_status).toBeNull();
    expect(publicRowToShowEntryRow(makeRow()).entry_fee).toBeNull();
  });

  it('preserves safe identity fields needed by the public running order', () => {
    const raw = publicRowToRawEntryRow(makeRow());
    expect(raw.armband).toBe('42');
    expect(raw.handler).toBe('Pat Handler');
    expect(raw.run_order).toBe(3);
    expect(raw.dog?.name).toBe('Ranger');

    const trial = publicRowToTrialEntryRow(makeRow());
    expect(trial.class.trial_id).toBe('trial-1');
    expect(trial.class.name).toBe('Container Novice A');

    const show = publicRowToShowEntryRow(makeRow());
    expect(show.entry_status).toBe('confirmed');
    expect(show.created_at).toBe('2026-06-01T10:00:00Z');
  });

  it('maps a missing dog to null rather than a hollow object', () => {
    const raw = publicRowToRawEntryRow(makeRow({ dog_id: null }));
    expect(raw.dog).toBeNull();
  });
});
