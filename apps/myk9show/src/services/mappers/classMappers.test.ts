import { describe, expect, it } from 'vitest';
import {
  mapClassInputToUpdate,
  mapDatabaseToClass,
  mapDatabaseToEntry,
  type DbClassWithRelations,
} from './classMappers';

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

describe('class entry limit and wait list (MYK9-998)', () => {
  it('writes the limit and the wait list switch to max_entries and allow_waitlist', () => {
    expect(mapClassInputToUpdate({ maxEntries: 12, allowsWaitlist: true })).toEqual(
      expect.objectContaining({ max_entries: 12, allow_waitlist: true })
    );
  });

  it('writes null to clear the limit, and leaves both untouched when absent', () => {
    expect(mapClassInputToUpdate({ maxEntries: null })).toEqual(
      expect.objectContaining({ max_entries: null })
    );
    const untouched = mapClassInputToUpdate({ className: 'x' });
    expect(untouched).not.toHaveProperty('max_entries');
    expect(untouched).not.toHaveProperty('allow_waitlist');
  });

  it('does not invent a limit of 40 for a class with none, and reads the switch', () => {
    const cls = mapDatabaseToClass({
      id: 'c1',
      trial_id: 't1',
      name: 'n',
      max_entries: null,
      allow_waitlist: true,
    } as unknown as DbClassWithRelations);
    expect(cls.maxEntries).toBeUndefined();
    expect(cls.allowsWaitlist).toBe(true);
  });
});
