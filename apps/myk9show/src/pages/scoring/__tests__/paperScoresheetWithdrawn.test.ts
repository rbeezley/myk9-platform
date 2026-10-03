import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClassById, mockGetEntriesByClass, mockDogGet, mockGetArmbandsByShow } = vi.hoisted(
  () => ({
    mockGetClassById: vi.fn(),
    mockGetEntriesByClass: vi.fn(),
    mockDogGet: vi.fn(),
    mockGetArmbandsByShow: vi.fn(),
  })
);

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: mockGetClassById },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: mockGetEntriesByClass },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: mockDogGet },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: mockGetArmbandsByShow },
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: vi.fn(),
}));

import { loadEntriesWithDogs } from '../paperScoresheetData';

/**
 * MYK9-976: Heartland Scent Work Classic, Trial 1 Exterior Excellent. One
 * pending entry (Juni, armband 102) and two withdrawn-and-refunded entries
 * (Ranger and Maple) whose `entries.armband` is NULL while the show's armbands
 * table still holds 101 and 104.
 */
const SHOW_ID = 'show-heartland';
const maple = {
  id: 'maple',
  classId: 'class-1',
  showId: SHOW_ID,
  dogId: 'dog-maple',
  entryStatus: 'withdrawn',
  paymentStatus: 'refunded',
};
const ranger = { ...maple, id: 'ranger', dogId: 'dog-ranger' };
const juni = {
  id: 'juni',
  classId: 'class-1',
  showId: SHOW_ID,
  dogId: 'dog-juni',
  armband: '102',
  entryStatus: 'submitted',
  paymentStatus: 'pending',
};
const showArmbands = [
  { id: 'a1', showId: SHOW_ID, dogId: 'dog-ranger', armbandNumber: '101', isAvailable: false },
  { id: 'a2', showId: SHOW_ID, dogId: 'dog-juni', armbandNumber: '102', isAvailable: false },
  { id: 'a3', showId: SHOW_ID, dogId: 'dog-maple', armbandNumber: '104', isAvailable: false },
];

describe('paper scoring list for a class with withdrawn entries (MYK9-976)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntriesByClass.mockResolvedValue([maple, ranger, juni]);
    mockGetArmbandsByShow.mockResolvedValue(showArmbands);
    mockDogGet.mockImplementation(async (id: string) => ({ id, name: id, callName: id }));
    mockGetClassById.mockResolvedValue({ id: 'class-1', name: 'Exterior Excellent' });
  });

  it('lists only the pending entry, so the denominator is 1 not 3', async () => {
    const entries = await loadEntriesWithDogs('class-1');

    expect(entries.map(e => e.entryId)).toEqual(['juni']);
    expect(entries[0]?.armband).toBe(102);
  });

  it('resolves an armband from the show armbands when the entry column is empty', async () => {
    mockGetEntriesByClass.mockResolvedValue([
      { ...ranger, entryStatus: 'confirmed', paymentStatus: 'paid' },
    ]);

    const [row] = await loadEntriesWithDogs('class-1');

    expect(row?.armband).toBe(101);
  });

  it('falls back to the entry column when the armbands table cannot be read', async () => {
    mockGetArmbandsByShow.mockRejectedValue(new Error('offline'));
    mockGetEntriesByClass.mockResolvedValue([
      { ...juni, armband: undefined },
      { ...juni, id: 'juni-2', armband: '7' },
    ]);

    const entries = await loadEntriesWithDogs('class-1');

    expect(entries.map(e => e.armband)).toEqual([0, 7]);
  });

  it('keeps a pulled-at-check-in dog listed: only lifecycle removes a row', async () => {
    mockGetEntriesByClass.mockResolvedValue([
      { ...juni, entryStatus: 'confirmed', checkInStatus: 'pulled' },
    ]);

    expect((await loadEntriesWithDogs('class-1')).map(e => e.entryId)).toEqual(['juni']);
  });
});
