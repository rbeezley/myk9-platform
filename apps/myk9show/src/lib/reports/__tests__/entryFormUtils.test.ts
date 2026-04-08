import { describe, it, expect } from 'vitest';
import { buildClassGrid, groupEntriesByDog, sortEntryFormDogs } from '../entryFormUtils';
import type {
  EntryFormTrial,
  EntryFormEntry,
  EntryFormDog,
  EntryFormPerson,
} from '../entryFormTypes';

const makeOwner = (last: string = 'Smith'): EntryFormPerson => ({
  firstName: 'Jane',
  lastName: last,
  streetAddress: '123 Main St',
  city: 'Dallas',
  state: 'TX',
  zipCode: '75001',
  phone: '555-0100',
  email: 'jane@example.com',
});

const makeDog = (overrides: Partial<EntryFormDog> = {}): EntryFormDog => ({
  dogId: 'dog-1',
  callName: 'Star',
  breed: 'Golden Retriever',
  sex: 'Female',
  dateOfBirth: '2022-03-15',
  registration: {
    registeredName: "GCH Oakwood's Rising Star",
    registrationNumber: 'DN12345678',
    organization: 'AKC',
    variety: null,
  },
  breeder: null,
  sire: null,
  dam: null,
  owner: makeOwner(),
  handler: null,
  armband: 101,
  entries: [],
  agreementDate: '2026-04-01',
  ...overrides,
});

const trials: EntryFormTrial[] = [
  { id: 'trial-1', date: '2026-04-12', trialNumber: 1 },
  { id: 'trial-2', date: '2026-04-12', trialNumber: 2 },
];

describe('buildClassGrid', () => {
  it('returns checked levels for matching entries', () => {
    const entries: EntryFormEntry[] = [
      {
        id: 'e1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
      {
        id: 'e2',
        trialId: 'trial-1',
        classId: 'c2',
        element: 'Interior',
        level: 'Excellent',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
    ];
    const grid = buildClassGrid(entries, trials);
    const t1Container = grid.get('trial-1')?.get('Container');
    expect(t1Container?.checkedLevels.has('Excellent')).toBe(true);
    expect(t1Container?.checkedLevels.has('Novice')).toBe(false);
    const t1Interior = grid.get('trial-1')?.get('Interior');
    expect(t1Interior?.checkedLevels.has('Excellent')).toBe(true);
    const t2Container = grid.get('trial-2')?.get('Container');
    expect(t2Container?.checkedLevels.size).toBe(0);
  });

  it('sets noviceClass to A or B', () => {
    const entries: EntryFormEntry[] = [
      {
        id: 'e1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Novice B',
        armband: 101,
        handler: null,
        submittedAt: null,
      },
    ];
    const grid = buildClassGrid(entries, trials);
    const cell = grid.get('trial-1')?.get('Container');
    expect(cell?.checkedLevels.has('Novice')).toBe(true);
    expect(cell?.noviceClass).toBe('B');
  });

  it('returns empty grid for no entries', () => {
    const grid = buildClassGrid([], trials);
    const cell = grid.get('trial-1')?.get('Container');
    expect(cell?.checkedLevels.size).toBe(0);
    expect(cell?.noviceClass).toBeNull();
  });
});

describe('groupEntriesByDog', () => {
  it('groups entries from the same dog together', () => {
    const rawEntries = [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Excellent',
      },
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        classId: 'c2',
        element: 'Interior',
        level: 'Excellent',
      },
      {
        dogId: 'dog-2',
        trialId: 'trial-1',
        classId: 'c1',
        element: 'Container',
        level: 'Novice A',
      },
    ];
    const grouped = groupEntriesByDog(rawEntries);
    expect(grouped.get('dog-1')?.length).toBe(2);
    expect(grouped.get('dog-2')?.length).toBe(1);
  });

  it('returns empty map for empty input', () => {
    const grouped = groupEntriesByDog([]);
    expect(grouped.size).toBe(0);
  });
});

describe('sortEntryFormDogs', () => {
  it('sorts by armband number', () => {
    const dogs = [
      makeDog({ dogId: 'dog-2', armband: 200, callName: 'Zulu' }),
      makeDog({ dogId: 'dog-1', armband: 101, callName: 'Alpha' }),
    ];
    const sorted = sortEntryFormDogs(dogs, 'armband');
    expect(sorted[0].armband).toBe(101);
    expect(sorted[1].armband).toBe(200);
  });

  it('sorts by owner last name', () => {
    const dogs = [
      makeDog({ dogId: 'dog-1', owner: makeOwner('Zimmerman') }),
      makeDog({ dogId: 'dog-2', owner: makeOwner('Adams') }),
    ];
    const sorted = sortEntryFormDogs(dogs, 'owner-name');
    expect(sorted[0].owner.lastName).toBe('Adams');
    expect(sorted[1].owner.lastName).toBe('Zimmerman');
  });

  it('sorts by dog registered name', () => {
    const dogs = [
      makeDog({
        dogId: 'dog-1',
        registration: {
          registeredName: 'Zephyr Wind',
          registrationNumber: 'DN1',
          organization: 'AKC',
          variety: null,
        },
      }),
      makeDog({
        dogId: 'dog-2',
        registration: {
          registeredName: 'Alpine Star',
          registrationNumber: 'DN2',
          organization: 'AKC',
          variety: null,
        },
      }),
    ];
    const sorted = sortEntryFormDogs(dogs, 'dog-name');
    expect(sorted[0].registration?.registeredName).toBe('Alpine Star');
  });

  it('defaults to armband sort for unknown sort key', () => {
    const dogs = [
      makeDog({ dogId: 'dog-2', armband: 200 }),
      makeDog({ dogId: 'dog-1', armband: 101 }),
    ];
    const sorted = sortEntryFormDogs(dogs, 'unknown');
    expect(sorted[0].armband).toBe(101);
  });
});
