import { describe, it, expect } from 'vitest';
import { USER_ENTRIES_SELECT, findMissingReplicatedUserEntryRelations } from './search';

/**
 * The PostgREST fallback for getUserEntries must select every column the
 * MyEntries mapper (transformEntry) reads. A dropped column silently renders a
 * default on the fallback path — e.g. a missing check_in_status reads as
 * "Not Checked In" even after a persisted check-in (the regression this guards).
 */
describe('USER_ENTRIES_SELECT (getUserEntries PostgREST fallback shape)', () => {
  const requiredColumns = [
    'check_in_status',
    'entry_status',
    'payment_status',
    'entry_fee',
    'armband',
    'is_scored',
    'result_status',
    'search_time_seconds',
    'total_faults',
    'final_placement',
    'start_date',
    'end_date',
    'entry_close_date',
    'call_name',
    'confirmation_number',
    'class_number',
    'trial_type',
  ];

  it.each(requiredColumns)('selects "%s"', column => {
    expect(USER_ENTRIES_SELECT).toContain(column);
  });

  it('selects trial type through class_id for legacy rows with entries.trial_id null', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /class:class_id\s*\([^)]*trial:trial_id\s*\([^)]*trial_type/s
    );
  });

  it('selects enrollment payment status for secretary-recorded grouped payments', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /registration:registration_id\s*\([^)]*confirmation_number[^)]*payment_status/s
    );
  });
});

describe('findMissingReplicatedUserEntryRelations', () => {
  it('reports class/show/dog relation rows that have not hydrated yet', () => {
    const missing = findMissingReplicatedUserEntryRelations(
      [
        {
          id: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          showId: 'show-1',
        },
        {
          id: 'entry-2',
          classId: 'class-2',
          dogId: 'dog-2',
          showId: 'show-1',
        },
      ],
      {
        classesMap: new Map([['class-1', {}]]),
        dogsMap: new Map([['dog-1', {}]]),
        showsMap: new Map([['show-1', {}]]),
      }
    );

    expect(missing).toEqual(['class:class-2', 'dog:dog-2']);
  });

  it('returns no missing relations when every referenced row is available', () => {
    const missing = findMissingReplicatedUserEntryRelations(
      [
        {
          id: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          showId: 'show-1',
        },
      ],
      {
        classesMap: new Map([['class-1', {}]]),
        dogsMap: new Map([['dog-1', {}]]),
        showsMap: new Map([['show-1', {}]]),
      }
    );

    expect(missing).toEqual([]);
  });
});
