import { describe, expect, it } from 'vitest';
import type { OwnEntryLabel } from './entriesToday';
import { labelsFromMyEntries, selectEntriesToday } from './entriesToday';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules/my-entries-types';

function label(overrides: Partial<OwnEntryLabel>): OwnEntryLabel {
  return {
    entryId: 'e1',
    showId: 'show-today',
    kind: 'accepted',
    checkInStatus: 'no-status',
    dogCallName: 'Scout',
    classLabel: 'Container Novice A',
    ...overrides,
  };
}

describe('selectEntriesToday', () => {
  const today = new Set(['show-today']);

  it('keeps entries in a show happening today, with a Check in line until checked in', () => {
    expect(selectEntriesToday([label({})], today)).toEqual([
      {
        entryId: 'e1',
        showId: 'show-today',
        dogCallName: 'Scout',
        classLabel: 'Container Novice A',
        statusLabel: 'Check in',
      },
    ]);
  });

  it('words a checked-in entry as checked in', () => {
    const [line] = selectEntriesToday([label({ checkInStatus: 'checked-in' })], today);
    expect(line?.statusLabel).toBe('Checked in');
  });

  it('drops entries in shows that are not today', () => {
    expect(selectEntriesToday([label({ showId: 'show-next-month' })], today)).toEqual([]);
  });

  it('drops pulled and withdrawn entries', () => {
    expect(
      selectEntriesToday(
        [
          label({ entryId: 'pulled', checkInStatus: 'pulled' }),
          label({ entryId: 'withdrawn', kind: 'withdrawn' }),
        ],
        today
      )
    ).toEqual([]);
  });

  it('keeps a completed entry as Done, but not a cancelled one', () => {
    const lines = selectEntriesToday(
      [
        label({ entryId: 'done', kind: 'completed' }),
        label({ entryId: 'done-ring', checkInStatus: 'completed' }),
        label({ entryId: 'cancelled', kind: 'withdrawn' }),
      ],
      today
    );
    expect(lines.map(l => [l.entryId, l.statusLabel])).toEqual([
      ['done', 'Done'],
      ['done-ring', 'Done'],
    ]);
  });
});

function classRow(overrides: Partial<EntryClass>): EntryClass {
  return {
    id: 'row-1',
    entryStatusKind: 'accepted',
    name: 'Container Novice A',
    number: '1',
    fee: 0,
    status: 'entered',
    ...overrides,
  };
}

function myEntry(classes: EntryClass[]): MyEntry {
  return {
    id: 'order-1',
    showId: 'show-today',
    dogName: 'Scout',
    dogs: [{ id: 'd1', dogId: 'dog-1', dogName: 'Scout', classes }],
    classes,
  } as unknown as MyEntry;
}

describe('labelsFromMyEntries', () => {
  it('labels each class row with the dog and class, and drops removed, withdrawn and unpaid online rows', () => {
    const labels = labelsFromMyEntries([
      myEntry([
        classRow({ id: 'live' }),
        classRow({ id: 'removed', deletedAt: '2026-10-01T00:00:00Z' }),
        classRow({ id: 'withdrawn', status: 'withdrawn' }),
        classRow({
          id: 'unpaid',
          entryStatusKind: 'pending',
          paymentMethod: 'online',
          rawPaymentStatus: 'pending' as EntryClass['rawPaymentStatus'],
        }),
        classRow({ id: 'unresolved', unresolved: true, name: 'Class details unavailable' }),
      ]),
    ]);
    expect(labels.map(l => [l.entryId, l.dogCallName, l.classLabel])).toEqual([
      ['live', 'Scout', 'Container Novice A'],
      ['unresolved', 'Scout', ''],
    ]);
  });
});
