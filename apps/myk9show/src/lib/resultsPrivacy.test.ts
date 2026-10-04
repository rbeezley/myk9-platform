import { describe, expect, it } from 'vitest';
import { isPrivateResultRow, PRIVATE_ENTRY_LABEL } from './resultsPrivacy';
import { publicRowToRawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { mapReleasedResultRow } from '@/hooks/queries/useClassReleasedResults';
import type { PublicEntryRow } from '@/services/database/entries';

/** The exact anonymised shape `view_public_entry_results` returns (MYK9-969). */
const ANONYMISED_ROW: PublicEntryRow = {
  id: '6f0b1c1e-0000-4000-8000-000000000001',
  class_id: 'class-1',
  trial_id: 'trial-1',
  show_id: 'show-1',
  dog_id: null,
  armband: null,
  handler: null,
  run_order: null,
  is_in_ring: false,
  is_scored: true,
  check_in_status: 'checked-in',
  entry_status: 'confirmed',
  scoring_completed_at: null,
  created_at: null,
  final_placement: 1,
  result_status: 'qualified',
  search_time_seconds: null,
  total_score: null,
  total_faults: null,
  result_text: 'Q',
  dog_name: PRIVATE_ENTRY_LABEL,
  dog_call_name: PRIVATE_ENTRY_LABEL,
  dog_breed: null,
  dog_image_url: null,
  class_name: 'Container Novice',
  class_level: 'Novice',
  class_element: 'Container',
  class_results_released_at: '2026-10-04T15:00:00Z',
};

const NAMED_ROW: PublicEntryRow = {
  ...ANONYMISED_ROW,
  id: 'entry-2',
  dog_id: 'dog-2',
  armband: '102',
  handler: 'Ann Handler',
  dog_name: 'Rex Registered',
  dog_call_name: 'Rex',
  dog_breed: 'Beagle',
  final_placement: 2,
  search_time_seconds: 41.25,
};

describe('isPrivateResultRow (MYK9-969)', () => {
  it('trusts results_private when the read carried it', () => {
    expect(isPrivateResultRow({ results_private: true, dog_id: 'dog-1' })).toBe(true);
    expect(isPrivateResultRow({ results_private: false, dog_id: null })).toBe(false);
  });

  it("recognises the public view's anonymised row by its null dog id", () => {
    expect(isPrivateResultRow(ANONYMISED_ROW)).toBe(true);
    expect(isPrivateResultRow({ dog_id: null })).toBe(true);
  });

  // Codex round 5: a real dog may be NAMED "Private entry". Only the server's
  // explicit signals classify a row, never the display name.
  it('never classifies by the display name', () => {
    expect(isPrivateResultRow(NAMED_ROW)).toBe(false);
    expect(
      isPrivateResultRow({
        dog_id: 'dog-9',
        dog_call_name: PRIVATE_ENTRY_LABEL,
        dog_name: PRIVATE_ENTRY_LABEL,
      } as never)
    ).toBe(false);
  });

  it('a select that did not ask for dog_id is never classified private', () => {
    expect(isPrivateResultRow({})).toBe(false);
  });
});

describe('public result rows keep a private entry at its place', () => {
  it('publicRowToRawEntryRow keeps the dog name and marks the row private', () => {
    const raw = publicRowToRawEntryRow(ANONYMISED_ROW);
    expect(raw.results_private).toBe(true);
    expect(raw.final_placement).toBe(1);
    expect(raw.dog).toMatchObject({ name: PRIVATE_ENTRY_LABEL, call_name: PRIVATE_ENTRY_LABEL });
    expect(raw.handler).toBeNull();
    expect(raw.search_time_seconds).toBeNull();

    const named = publicRowToRawEntryRow(NAMED_ROW);
    expect(named.results_private).toBe(false);
    expect(named.dog).toMatchObject({ id: 'dog-2', call_name: 'Rex' });
  });

  it('mapReleasedResultRow shows "Private entry" at its place with no time', () => {
    const { raw, entry } = mapReleasedResultRow(
      ANONYMISED_ROW as unknown as Record<string, unknown>
    );
    expect(entry.dog).toBe(PRIVATE_ENTRY_LABEL);
    expect(entry.placement).toBe('1');
    expect(entry.time).toBe('');
    expect(entry.handler).toBe('');
    expect(entry.armband).toBe('');
    expect(raw.results_private).toBe(true);
    expect(raw.dog_id).toBe('');
  });
});
