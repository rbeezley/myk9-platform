import { describe, it, expect } from 'vitest';
import { parseRestoreDogResult } from './restoreDogResult';

describe('parseRestoreDogResult (restore_dog jsonb, MYK9-607)', () => {
  it('maps the jsonb restore_dog returns, including every skipped placement', () => {
    expect(
      parseRestoreDogResult({
        dog_id: 'dog-1',
        entries_restored: 2,
        placements_reapplied: 1,
        placements_skipped: [
          { entry_id: 'e-1', class_id: 'c-1', class_name: 'Novice Interior', final_placement: 1 },
        ],
      })
    ).toEqual({
      dogId: 'dog-1',
      entriesRestored: 2,
      placementsReapplied: 1,
      placementsSkipped: [
        { entryId: 'e-1', classId: 'c-1', className: 'Novice Interior', finalPlacement: 1 },
      ],
    });
  });

  it('keeps a skipped placement whose class name is missing, and drops malformed ones', () => {
    const result = parseRestoreDogResult({
      dog_id: 'dog-1',
      entries_restored: 1,
      placements_reapplied: 0,
      placements_skipped: [
        { entry_id: 'e-1', class_id: 'c-1', class_name: null, final_placement: 2 },
        { entry_id: 'e-2', class_id: 'c-2' },
        'nonsense',
      ],
    });
    expect(result?.placementsSkipped).toEqual([
      { entryId: 'e-1', classId: 'c-1', className: null, finalPlacement: 2 },
    ]);
  });

  it('returns null for a shape that is not a restore result', () => {
    expect(parseRestoreDogResult(null)).toBeNull();
    expect(parseRestoreDogResult([{ id: 'dog-1' }])).toBeNull();
    expect(parseRestoreDogResult({ entries_restored: 1 })).toBeNull();
  });
});
