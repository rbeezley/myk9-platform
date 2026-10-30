import { describe, expect, it } from 'vitest';
import { buildShowArmbandMaps } from '@/features/_shared/entryArmband';
import type { ReplicatedEntry } from '@/services/replication';
import {
  buildStaffDogs,
  filterStaffDogs,
  formatDogCount,
  sortStaffDogs,
  type StaffDogClassInfo,
} from './staffDogIndex';

const classes = new Map<string, StaffDogClassInfo>([
  ['c1', { className: 'Novice A', classIds: ['c1'], resultsReleasedAt: null, trialLabel: 'Day 1' }],
  [
    'c2',
    { className: 'Open B', classIds: ['c2'], resultsReleasedAt: '2030-01-01', trialLabel: 'Day 1' },
  ],
]);

function entry(over: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return { classId: 'c1', ...over } as ReplicatedEntry;
}

const entries = [
  entry({
    id: 'e1',
    dogId: 'd1',
    armband: '12',
    dogCallName: 'Zip',
    dogBreed: 'Beagle',
    handler: 'Amy Ng',
  }),
  entry({
    id: 'e2',
    dogId: 'd1',
    armband: '12',
    classId: 'c2',
    dogCallName: 'Zip',
    dogBreed: 'Beagle',
    handler: 'Amy Ng',
    checkInStatus: 'checked-in',
  }),
  entry({
    id: 'e3',
    dogId: 'd2',
    armband: '3',
    dogCallName: 'Bo',
    dogBreed: 'Border Collie',
    handler: 'Zed Roe',
  }),
  entry({ id: 'e4', dogId: 'd3', dogCallName: 'Moss', dogBreed: 'Lab', handler: 'Cy Park' }),
  entry({
    id: 'e5',
    dogId: 'd4',
    armband: '40',
    dogCallName: 'Gone',
    deletedAt: '2030-01-01',
  } as Partial<ReplicatedEntry> & { id: string }),
  entry({ id: 'e6', dogId: 'd5', armband: '41', dogCallName: 'Pulled', checkInStatus: 'pulled' }),
];
const EMPTY_MAPS = buildShowArmbandMaps([]);
const dogs = buildStaffDogs(entries, classes, EMPTY_MAPS);
const none = new Set<number>();

describe('buildStaffDogs', () => {
  it('groups one row per dog across classes and drops deleted entries', () => {
    expect(dogs.map(d => d.key).sort()).toEqual(['d1', 'd2', 'd3', 'd5']);
    expect(dogs.find(d => d.key === 'd1')?.entries.map(e => e.className)).toEqual([
      'Novice A',
      'Open B',
    ]);
  });

  it('counts only unchecked, unpulled entries for check-in-all', () => {
    expect(dogs.find(d => d.key === 'd1')?.uncheckedEntryIds).toEqual(['e1']);
    expect(dogs.find(d => d.key === 'd5')?.uncheckedEntryIds).toEqual([]);
  });
});

describe('buildStaffDogs eligibility and armbands', () => {
  it('leaves withdrawn, moved and absent entries out of check-in-all', () => {
    const built = buildStaffDogs(
      ['withdrawn', 'moved', 'absent', 'not_accepted', 'confirmed'].map(entryStatus =>
        entry({ id: `s-${entryStatus}`, dogId: 'dx', entryStatus } as Partial<ReplicatedEntry> & {
          id: string;
        })
      ),
      classes,
      EMPTY_MAPS
    );
    expect(built[0]?.uncheckedEntryIds).toEqual(['s-confirmed']);
  });

  it('shows a checked-in then withdrawn entry as pulled, not checked in', () => {
    const built = buildStaffDogs(
      [
        entry({
          id: 'w1',
          dogId: 'dw',
          checkInStatus: 'checked-in',
          entryStatus: 'withdrawn',
        } as Partial<ReplicatedEntry> & { id: string }),
      ],
      classes,
      EMPTY_MAPS
    );
    expect(built[0]?.entries[0]?.checkInStatus).toBe('pulled');
  });

  it('resolves a missing armband from the show assignment table', () => {
    const maps = buildShowArmbandMaps([{ armbandNumber: '77', dogId: 'dz' }]);
    const built = buildStaffDogs(
      [entry({ id: 'ez', dogId: 'dz', dogCallName: 'Neo' })],
      classes,
      maps
    );
    expect(built[0]?.armband).toBe(77);
  });
});

describe('filterStaffDogs', () => {
  it('searches dog, breed and handler case-insensitively', () => {
    const find = (query: string) =>
      filterStaffDogs(dogs, { tab: 'all', query, favoriteArmbands: none }).map(d => d.dogName);
    expect(find('zip')).toEqual(['Zip']);
    expect(find('COLLIE')).toEqual(['Bo']);
    expect(find('park')).toEqual(['Moss']);
    expect(find('nothing')).toEqual([]);
  });

  it('favorites tab keeps only favorited armbands', () => {
    const shown = filterStaffDogs(dogs, {
      tab: 'favorites',
      query: '',
      favoriteArmbands: new Set([3]),
    });
    expect(shown.map(d => d.dogName)).toEqual(['Bo']);
  });
});

describe('sortStaffDogs', () => {
  const names = (sort: Parameters<typeof sortStaffDogs>[1]) =>
    sortStaffDogs(dogs, sort).map(d => d.dogName);
  it('sorts by armband numerically with unassigned last', () => {
    expect(names('armband')).toEqual(['Bo', 'Zip', 'Pulled', 'Moss']);
  });
  it('sorts by dog and by handler', () => {
    expect(names('dog')).toEqual(['Bo', 'Moss', 'Pulled', 'Zip']);
    expect(names('handler')).toEqual(['Pulled', 'Zip', 'Moss', 'Bo']);
  });
});

it('formats the count', () => {
  expect(formatDogCount(2, 10)).toBe('2 of 10 dogs');
  expect(formatDogCount(1, 1)).toBe('1 of 1 dog');
});
