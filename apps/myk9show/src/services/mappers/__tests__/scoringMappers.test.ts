/**
 * Regression: mapDbEntryToScentWorkEntry must map entry_status='in-ring' to
 * EntryStatus 'in-ring', not fall back to the default 'confirmed'.
 * Before this fix, 'in-ring' was absent from the valid-statuses allowlist.
 */

import { describe, it, expect } from 'vitest';
import { mapDbEntryToScentWorkEntry } from '@/services/mappers/scoringMappers';
import type { DbEntryWithDog } from '@/services/mappers/scoringMappers';
import type { ScentWorkClassConfig } from '@/types/scent-work-types';

const CLASS_CONFIG: ScentWorkClassConfig = {
  element: 'Container',
  level: 'Novice',
  timeLimit: 180_000,
  warningsEnabled: true,
};

function makeEntry(entry_status: string | null): DbEntryWithDog {
  return {
    id: 'e1',
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler: 'Jane Doe',
    handler_id: 'p1',
    armband: '42',
    entry_status,
    entry_fee: 0,
    payment_status: 'paid',
    run_order: 1,
    special_requests: null,
    submitted_at: null,
    created_at: null,
    updated_at: null,
    check_in_status: null,
    result_status: null,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    is_scored: null,
    is_in_ring: null,
    scoring_started_at: null,
    scoring_completed_at: null,
    disqualification_reason: null,
  };
}

describe('mapDbEntryToScentWorkEntry — entry_status mapping', () => {
  it('passes through in-ring as EntryStatus in-ring', () => {
    // myK9Q writes 'in-ring'; must not fall back to confirmed
    const result = mapDbEntryToScentWorkEntry(makeEntry('in-ring'), CLASS_CONFIG);
    expect(result.status).toBe('in-ring');
  });

  it('passes through competing as EntryStatus competing', () => {
    const result = mapDbEntryToScentWorkEntry(makeEntry('competing'), CLASS_CONFIG);
    expect(result.status).toBe('competing');
  });

  it('falls back to confirmed for unknown status', () => {
    const result = mapDbEntryToScentWorkEntry(makeEntry('bogus-status'), CLASS_CONFIG);
    expect(result.status).toBe('confirmed');
  });

  it('passes through confirmed', () => {
    const result = mapDbEntryToScentWorkEntry(makeEntry('confirmed'), CLASS_CONFIG);
    expect(result.status).toBe('confirmed');
  });

  it('uses check_in_status, not result_status, for check-in state', () => {
    const entry = {
      ...makeEntry('confirmed'),
      check_in_status: 'checked-in',
      result_status: 'Not Qualified',
    } as DbEntryWithDog & { check_in_status: string | null };

    const result = mapDbEntryToScentWorkEntry(entry, CLASS_CONFIG);

    expect(result.checkInStatus).toBe('checked-in');
  });
});
