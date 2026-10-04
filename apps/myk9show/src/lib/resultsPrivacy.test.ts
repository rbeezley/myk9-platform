import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
    expect(
      isPrivateResultRow({ results_private: false, dog_id: null, dog_call_name: 'Private entry' })
    ).toBe(false);
  });

  it("recognises the public view's anonymised row when results_private was not selected", () => {
    expect(isPrivateResultRow(ANONYMISED_ROW)).toBe(true);
    expect(isPrivateResultRow({ dog_call_name: PRIVATE_ENTRY_LABEL })).toBe(true);
  });

  it('does not treat a named row, or a dog literally named so with an id, as private', () => {
    expect(isPrivateResultRow(NAMED_ROW)).toBe(false);
    expect(isPrivateResultRow({ dog_id: 'dog-9', dog_call_name: PRIVATE_ENTRY_LABEL })).toBe(false);
  });

  it('uses the same words as the SQL view it recognises', () => {
    // The explicit public selects do not carry results_private, so this label
    // is how they recognise the row. Read the LATEST view definition.
    const migrationsDir = resolve(import.meta.dirname, '../../../../supabase/migrations');
    const defining = readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .sort()
      .filter(name =>
        /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+public\.view_public_entry_results\b/i.test(
          readFileSync(resolve(migrationsDir, name), 'utf8')
        )
      );
    const latest = readFileSync(resolve(migrationsDir, defining[defining.length - 1]!), 'utf8');
    expect(latest).toContain(
      `CASE WHEN privacy.masked THEN '${PRIVATE_ENTRY_LABEL}'::text ELSE d.call_name END AS dog_call_name`
    );
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
