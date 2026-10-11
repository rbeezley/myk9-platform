import { describe, expect, it } from 'vitest';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';
import {
  dogFilterLabel,
  filterByDog,
  orderMyEntriesToday,
  resolveDogSelection,
  summarizeDogs,
} from './orderMyEntriesToday';

const NO_PLACES: ReadonlyMap<string, number> = new Map();

function row(overrides: Partial<AtShowEntryDetail> & { entryId: string }): AtShowEntryDetail {
  return {
    classId: 'class-a',
    dogName: 'Juni',
    dogKey: 'dog-juni',
    armband: '101',
    checkInStatus: 'checked-in',
    className: 'Container Novice',
    expectedStartLabel: null,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    resultStatus: null,
    resultTimeSeconds: null,
    selfCheckinState: 'allowed',
    trialLabel: null,
    runOrder: 1,
    startTime: '09:00',
    trialTimezone: 'America/Chicago',
    ...overrides,
  };
}

const ids = (list: readonly AtShowEntryDetail[]) => list.map(item => item.entryId);

describe('orderMyEntriesToday', () => {
  it('orders across dogs by class start, then by run order inside a class', () => {
    const entries = [
      row({
        entryId: 'rex-late',
        dogName: 'Rex',
        dogKey: 'dog-rex',
        classId: 'c-late',
        startTime: '1:30 PM',
        runOrder: 2,
      }),
      row({ entryId: 'juni-early', classId: 'c-early', startTime: '9:00 AM', runOrder: 5 }),
      row({
        entryId: 'rex-early',
        dogName: 'Rex',
        dogKey: 'dog-rex',
        classId: 'c-early',
        startTime: '9:00 AM',
        runOrder: 3,
      }),
      row({ entryId: 'juni-late', classId: 'c-late', startTime: '1:30 PM', runOrder: 1 }),
    ];
    expect(ids(orderMyEntriesToday(entries, NO_PLACES))).toEqual([
      'rex-early',
      'juni-early',
      'juni-late',
      'rex-late',
    ]);
  });

  it('compares start times as values, not strings ("10:00 AM" is after "9:00 AM")', () => {
    const entries = [
      row({ entryId: 'ten', classId: 'c-ten', startTime: '10:00 AM' }),
      row({ entryId: 'nine', classId: 'c-nine', startTime: '9:00 AM' }),
      row({ entryId: 'iso', classId: 'c-iso', startTime: '2026-10-24T14:30:00Z' }), // 9:30 AM Chicago
    ];
    expect(ids(orderMyEntriesToday(entries, NO_PLACES))).toEqual(['nine', 'iso', 'ten']);
  });

  it('puts classes with no start time last, kept together', () => {
    const entries = [
      row({ entryId: 'unknown-b', classId: 'c-unknown', startTime: null, runOrder: 2 }),
      row({ entryId: 'known', classId: 'c-known', startTime: '8:00 AM' }),
      row({ entryId: 'unknown-a', classId: 'c-unknown', startTime: null, runOrder: 1 }),
    ];
    expect(ids(orderMyEntriesToday(entries, NO_PLACES))).toEqual([
      'known',
      'unknown-a',
      'unknown-b',
    ]);
  });

  it('breaks a tie between equal or unknown starts by class_order, then class id', () => {
    const entries = [
      row({ entryId: 'b', classId: 'c-b', startTime: null, classOrder: 1 }),
      row({ entryId: 'a', classId: 'c-a', startTime: null, classOrder: 2 }),
      row({ entryId: 'x', classId: 'c-x', startTime: '9:00 AM', classOrder: 9 }),
      row({ entryId: 'y', classId: 'c-y', startTime: '9:00 AM', classOrder: 3 }),
    ];
    expect(ids(orderMyEntriesToday(entries, NO_PLACES))).toEqual(['y', 'x', 'b', 'a']);
  });

  it('orders inside a class by the server place when every row there has one', () => {
    const entries = [
      row({ entryId: 'a', runOrder: 1, armband: '101' }),
      row({ entryId: 'b', runOrder: 2, armband: '102' }),
    ];
    // Server count disagrees with the stored order (a run-order gap or re-place).
    const places = new Map([
      ['a', 3],
      ['b', 1],
    ]);
    expect(ids(orderMyEntriesToday(entries, places))).toEqual(['b', 'a']);
  });

  it('uses the run-queue tie-break (run order, armband, id) when places are missing', () => {
    const entries = [
      row({ entryId: 'z', runOrder: 4, armband: '200' }),
      row({ entryId: 'y', runOrder: 4, armband: '150' }),
      row({ entryId: 'b', runOrder: 4, armband: '150' }),
      row({ entryId: 'first', runOrder: 2, armband: '300' }),
    ];
    // One row has a place, the rest do not: the class falls back to run order.
    const places = new Map([['z', 1]]);
    expect(ids(orderMyEntriesToday(entries, places))).toEqual(['first', 'b', 'y', 'z']);
  });

  it('does not mutate its input', () => {
    const entries = [row({ entryId: 'b', runOrder: 2 }), row({ entryId: 'a', runOrder: 1 })];
    const copy = [...entries];
    orderMyEntriesToday(entries, NO_PLACES);
    expect(entries).toEqual(copy);
  });
});

describe('dog filter', () => {
  const entries = [
    row({ entryId: 'j1', classId: 'c1' }),
    row({ entryId: 'j2', classId: 'c2' }),
    row({ entryId: 'r1', dogName: 'Rex', dogKey: 'dog-rex', classId: 'c1' }),
  ];

  it('counts each entry once per dog, across the whole day', () => {
    const doubled = [...entries, entries[0] as AtShowEntryDetail];
    expect(summarizeDogs(doubled)).toEqual([
      { dogKey: 'dog-juni', dogName: 'Juni', count: 2 },
      { dogKey: 'dog-rex', dogName: 'Rex', count: 1 },
    ]);
  });

  it('keeps two dogs with the same call name apart', () => {
    const twins = [row({ entryId: 'a', dogKey: 'dog-1' }), row({ entryId: 'b', dogKey: 'dog-2' })];
    expect(summarizeDogs(twins).map(dog => dog.count)).toEqual([1, 1]);
  });

  it('filters to one dog, and null means All', () => {
    expect(ids(filterByDog(entries, 'dog-juni'))).toEqual(['j1', 'j2']);
    expect(ids(filterByDog(entries, null))).toEqual(['j1', 'j2', 'r1']);
  });

  it('falls back to All when the selected dog has no rows left', () => {
    const dogs = summarizeDogs(entries);
    expect(resolveDogSelection('dog-juni', dogs)).toBe('dog-juni');
    expect(resolveDogSelection('dog-gone', dogs)).toBeNull();
    expect(resolveDogSelection(null, dogs)).toBeNull();
  });

  it('names the filter with the dog and its class count', () => {
    expect(dogFilterLabel({ dogKey: 'k', dogName: 'Juni', count: 2 })).toBe('Juni, 2 classes');
    expect(dogFilterLabel({ dogKey: 'k', dogName: 'Rex', count: 1 })).toBe('Rex, 1 class');
  });
});
