import { describe, expect, it } from 'vitest';
import { normalizeCanonicalEntry } from './useShowEntriesForUser';

describe('normalizeCanonicalEntry', () => {
  it('maps released scored fields into competition data', () => {
    const entry = normalizeCanonicalEntry({
      id: 'entry-1',
      show_id: 'show-1',
      class_id: 'class-1',
      dog_id: 'dog-1',
      entry_status: 'confirmed',
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 38.5,
      final_placement: 1,
      total_faults: 0,
      scoring_completed_at: '2026-08-01T09:15:00Z',
      updated_at: '2026-08-01T09:15:00Z',
    });

    expect(entry?.competitionData).toMatchObject({
      qualified: true,
      time: '0:38.50',
      placement: '1',
      faults: 0,
    });
  });

  it('keeps scored rows without released result fields pending', () => {
    const entry = normalizeCanonicalEntry({
      id: 'entry-1',
      show_id: 'show-1',
      class_id: 'class-1',
      dog_id: 'dog-1',
      entry_status: 'confirmed',
      is_scored: true,
      result_status: null,
      updated_at: '2026-08-01T09:15:00Z',
    });

    expect(entry?.competitionData).toBeUndefined();
  });
});
