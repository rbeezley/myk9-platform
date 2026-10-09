/**
 * MYK9-1031: an entry's results line is built from the row the upload writes, never from the
 * legacy snake_case aliases, and the lines hash to the same value as the entry-by-entry
 * fingerprint the server pins.
 */
import { describe, expect, it } from 'vitest';

import {
  classResultsCanonicalText,
  classResultsCanonicalTextFromLines,
  entryResultsLine,
} from '@/features/show-map/classResultsFingerprint';
import { entryToSupabaseRow } from '../ReplicatedEntriesTable.mapper';
import { replicatedEntryResultsLine } from '../replicatedEntryResultsLine';

const ID = '00000000-0000-0000-0000-000000104513';
const entry = (overrides: Record<string, unknown> = {}) =>
  ({
    id: ID,
    isScored: true,
    resultStatus: 'qualified',
    searchTimeSeconds: 45.2,
    area1_time_seconds: 45.2,
    total_correct_finds: 1,
    total_faults: 0,
    totalScore: 0,
    points_earned: 0,
    finalPlacement: '1',
    ...overrides,
  }) as never;

describe('replicatedEntryResultsLine', () => {
  it('hashes the placement the upload writes: finalPlacement wins over a stale final_placement', () => {
    // useClassResults recalculates placements by updating only `finalPlacement`.
    const line = replicatedEntryResultsLine(entry({ finalPlacement: '2', final_placement: '1' }));
    expect(line).toBe(
      replicatedEntryResultsLine(entry({ finalPlacement: '2', final_placement: '2' }))
    );
    expect(line).not.toBe(
      replicatedEntryResultsLine(entry({ finalPlacement: '1', final_placement: '1' }))
    );
  });

  it('carries no placement for a result that is not qualified, as the upload sends none', () => {
    expect(replicatedEntryResultsLine(entry({ resultStatus: 'nq', finalPlacement: '3' }))).toBe(
      replicatedEntryResultsLine(entry({ resultStatus: 'nq', finalPlacement: undefined }))
    );
  });

  it('moves when a result is corrected, not when an unrelated field changes', () => {
    const before = replicatedEntryResultsLine(entry());
    expect(replicatedEntryResultsLine(entry({ armband: '999', runOrder: 4 }))).toBe(before);
    expect(replicatedEntryResultsLine(entry({ resultStatus: 'nq' }))).not.toBe(before);
  });

  it('is null for an entry with no result yet and for a deleted one', () => {
    expect(
      replicatedEntryResultsLine(
        entry({ isScored: false, resultStatus: 'pending', finalPlacement: undefined })
      )
    ).toBeNull();
    expect(replicatedEntryResultsLine(entry({ deletedAt: '2026-10-10T00:00:00Z' }))).toBeNull();
  });

  it('lines hash to the same canonical text the entry-by-entry fingerprint pins', () => {
    const entries = [
      entry(),
      entry({ id: '00000000-0000-0000-0000-000000104511', resultStatus: 'nq' }),
    ];
    const rows = entries.map(e => ({
      ...(entryToSupabaseRow(e as never) as object),
      id: (e as { id: string }).id,
    }));
    const fromLines = classResultsCanonicalTextFromLines(
      entries.map(e => replicatedEntryResultsLine(e as never)).filter((l): l is string => l != null)
    );
    expect(fromLines).toBe(classResultsCanonicalText(rows as never));
    expect(entryResultsLine(rows[0] as never)).toBe(
      replicatedEntryResultsLine(entries[0] as never)
    );
  });
});
