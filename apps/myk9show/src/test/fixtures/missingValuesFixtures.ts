/**
 * The missing-values ("dirty data") fixture (MYK9-1655).
 *
 * Four of five recent escaped show-day bugs passed checks that only ran on
 * clean data: every seeded class had a trial date (MYK9-1557), every scored
 * run had a time (MYK9-1573), device zone equalled trial zone (MYK9-1554).
 * These builders produce the NULL / ZERO / MISSING variants of the same rows
 * the real code consumes, so a test takes only the dirt it needs.
 *
 * Unit-test only. This is not the database seed.
 */

import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';
import type { SecretaryEntry } from '@/services/database/entries';
import { makeClass, makeRow } from '@/test/fixtures/myShowsFixtures';

/**
 * A class whose trial has not replicated yet (partial replication): the entry
 * is there, the trial date is not. `trialDate` is optional on `EntryClass`.
 */
export function makeUndatedClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return makeClass({
    id: 'c-undated',
    classId: 'class-undated',
    ...overrides,
    trialDate: undefined,
  });
}

/** A class whose trial carries no timezone (the relation is unresolved). */
export function makeZonelessClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return makeClass({
    id: 'c-zoneless',
    classId: 'class-zoneless',
    ...overrides,
    trialTimezone: undefined,
  });
}

/** One dog row holding the given classes, on the shared Heartland show. */
export function makeDirtyRow(classes: EntryClass[], overrides: Partial<MyEntry> = {}): MyEntry {
  return makeRow({ classes, ...overrides });
}

let nextEntryId = 0;

/**
 * A scored, confirmed, qualified results entry, shaped like the rows the
 * results read returns. `over` replaces any column.
 */
export function makeScoredResultEntry(over: Record<string, unknown> = {}): SecretaryEntry {
  const armband = 'armband' in over ? over.armband : '101';
  return {
    id: `dirty-e-${nextEntryId++}`,
    class_id: 'c1',
    armband,
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: 0,
    search_time_seconds: 60,
    dog_id: `dog-${armband ?? 'none'}`,
    dog: { id: `dog-${armband ?? 'none'}`, name: 'Ranger', call_name: 'Rex' },
    handler_identity: { source: 'entered', name: 'Jane Doe' },
    ...over,
  } as unknown as SecretaryEntry;
}

/** A scored run whose time never arrived: `search_time_seconds` is null. */
export function makeNullTimeScoredEntry(over: Record<string, unknown> = {}): SecretaryEntry {
  return makeScoredResultEntry({ search_time_seconds: null, ...over });
}

/**
 * A scored NQ stored with a 0 time (`inputFormatToDbSeconds('')` writes 0
 * when no time is entered), and no points.
 */
export function makeZeroTimeNqEntry(over: Record<string, unknown> = {}): SecretaryEntry {
  return makeScoredResultEntry({
    result_status: 'nq',
    points_earned: 0,
    search_time_seconds: 0,
    ...over,
  });
}
