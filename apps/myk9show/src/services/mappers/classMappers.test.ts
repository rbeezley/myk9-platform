import { describe, expect, it } from 'vitest';
import { mapDatabaseToEntry } from './classMappers';

describe('mapDatabaseToEntry', () => {
  it('retains lifecycle fields required by canonical entry accounting', () => {
    const mapped = mapDatabaseToEntry({
      id: 'entry-1',
      class_id: 'class-1',
      entry_status: 'moved',
      check_in_status: 'pulled',
      is_scored: false,
      result_status: 'pending',
      deleted_at: null,
    });

    expect(mapped).toMatchObject({
      entryStatus: 'moved',
      checkInStatus: 'pulled',
      isScored: false,
      resultStatus: 'pending',
      deletedAt: null,
    });
  });
});
