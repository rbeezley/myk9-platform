import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockDogsTable, mockEntriesTable } = vi.hoisted(() => ({
  mockDogsTable: {
    getAllDogs: vi.fn(),
    getDogById: vi.fn(),
    getDogsByOwner: vi.fn(),
    searchDogs: vi.fn(),
    getAll: vi.fn(),
  },
  mockEntriesTable: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

// Mock supabase client (for loadOwnersMap and getDogById supplemental queries)
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: { owner: null, registrations: [], health_records: [] },
              error: null,
            }),
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        or: () => ({
          or: () => ({
            is: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    return { message: msg, code: 'UNKNOWN' };
  }),
}));

// Now import the functions under test
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  searchDogs,
  getDogsWithUpcomingShows,
  getDogStatistics,
} from '@/services/database/queries/dogQueries';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Bella',
    callName: 'Bell',
    breed: 'Golden Retriever',
    sex: 'female',
    dateOfBirth: '2022-03-15',
    ownerId: 'person-1',
    height: '24',
    weight: '65',
    color: 'Golden',
    microchipNumber: '123456789',
    isSpayedNeutered: true,
    imageUrl: 'https://example.com/bella.jpg',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    dogId: 'dog-1',
    handlerId: 'person-1',
    armband: '101',
    handler: 'Jane Doe',
    entryStatus: 'confirmed',
    jumpHeight: '20',
    entryFee: 30,
    paymentStatus: 'paid',
    runOrder: 1,
    moveUpRequested: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dogQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAllDogs
  // -----------------------------------------------------------------------
  describe('getAllDogs', () => {
    it('returns dogs filtered by ownerId and sorted by name', async () => {
      const dogs = [
        makeDog({ id: 'dog-2', name: 'Zeus', ownerId: 'person-1' }),
        makeDog({ id: 'dog-1', name: 'Bella', ownerId: 'person-1' }),
        makeDog({ id: 'dog-3', name: 'Max', ownerId: 'person-2' }),
      ];
      mockDogsTable.getAllDogs.mockResolvedValue(dogs);

      const result = await getAllDogs('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      // Sorted by name ascending
      expect((result.data[0] as Record<string, unknown>).name).toBe('Bella');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Zeus');
    });

    it('returns correct snake_case shape', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([makeDog()]);

      const result = await getAllDogs('person-1');

      expect(result.data).toHaveLength(1);
      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('dog-1');
      expect(row.name).toBe('Bella');
      expect(row.call_name).toBe('Bell');
      expect(row.breed).toBe('Golden Retriever');
      expect(row.sex).toBe('female');
      expect(row.date_of_birth).toBe('2022-03-15');
      expect(row.owner_id).toBe('person-1');
      expect(row.height).toBe('24');
      expect(row.weight).toBe('65');
      expect(row.color).toBe('Golden');
      expect(row.microchip_number).toBe('123456789');
      expect(row.spayed_neutered).toBe(true);
      expect(row.image_url).toBe('https://example.com/bella.jpg');
      expect(row.deleted_at).toBeNull();
    });

    it('returns empty array when no dogs match ownership', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([makeDog({ ownerId: 'other-person' })]);

      const result = await getAllDogs('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('returns empty array when no dogs exist', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([]);

      const result = await getAllDogs('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getDogById
  // -----------------------------------------------------------------------
  describe('getDogById', () => {
    it('returns dog with entries and supplemental data', async () => {
      mockDogsTable.getDogById.mockResolvedValue(makeDog());
      mockEntriesTable.getAll.mockResolvedValue([
        makeEntry({ dogId: 'dog-1' }),
        makeEntry({ id: 'entry-other', dogId: 'dog-other' }),
      ]);

      const result = await getDogById('dog-1');

      expect(result.error).toBeNull();
      const row = result.data as Record<string, unknown>;
      expect(row.id).toBe('dog-1');
      expect(row.name).toBe('Bella');
      // Entries filtered to this dog
      const entries = row.entries as Record<string, unknown>[];
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('entry-1');
      expect(entries[0].dog_id).toBe('dog-1');
      expect(entries[0].class_id).toBe('class-1');
      expect(entries[0].show_id).toBe('show-1');
    });

    it('returns { data: null, error: null } for missing dog', async () => {
      mockDogsTable.getDogById.mockResolvedValue(null);

      const result = await getDogById('non-existent');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getDogsByOwner
  // -----------------------------------------------------------------------
  describe('getDogsByOwner', () => {
    it('returns dogs sorted by name ascending', async () => {
      const dogs = [
        makeDog({ id: 'dog-2', name: 'Zeus' }),
        makeDog({ id: 'dog-1', name: 'Bella' }),
      ];
      mockDogsTable.getDogsByOwner.mockResolvedValue(dogs);

      const result = await getDogsByOwner('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).name).toBe('Bella');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Zeus');
    });

    it('returns snake_case shape without joins', async () => {
      mockDogsTable.getDogsByOwner.mockResolvedValue([makeDog()]);

      const result = await getDogsByOwner('person-1');

      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('dog-1');
      expect(row.owner_id).toBe('person-1');
      expect(row.call_name).toBe('Bell');
      // registrations default to empty array
      expect(row.registrations).toEqual([]);
    });

    it('returns empty array when owner has no dogs', async () => {
      mockDogsTable.getDogsByOwner.mockResolvedValue([]);

      const result = await getDogsByOwner('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // searchDogs
  // -----------------------------------------------------------------------
  describe('searchDogs', () => {
    it('filters results by ownership and sorts by name', async () => {
      const dogs = [
        makeDog({ id: 'dog-2', name: 'Zeus', ownerId: 'person-1' }),
        makeDog({ id: 'dog-1', name: 'Bella', ownerId: 'person-1' }),
        makeDog({ id: 'dog-3', name: 'Bella Jr', ownerId: 'person-2' }),
      ];
      mockDogsTable.searchDogs.mockResolvedValue(dogs);

      const result = await searchDogs('bell', 'person-1');

      expect(result.error).toBeNull();
      // Only person-1's dogs
      expect(result.data).toHaveLength(2);
      // Sorted by name ascending
      expect((result.data[0] as Record<string, unknown>).name).toBe('Bella');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Zeus');
    });

    it('returns empty array when no matches', async () => {
      mockDogsTable.searchDogs.mockResolvedValue([]);

      const result = await searchDogs('zzz', 'person-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('passes search term to replicated table', async () => {
      mockDogsTable.searchDogs.mockResolvedValue([]);

      await searchDogs('golden', 'person-1');

      expect(mockDogsTable.searchDogs).toHaveBeenCalledWith('golden');
    });
  });

  // -----------------------------------------------------------------------
  // getDogsWithUpcomingShows
  // -----------------------------------------------------------------------
  describe('getDogsWithUpcomingShows', () => {
    it('returns dogs filtered by ownership and sorted by name', async () => {
      const dogs = [
        makeDog({ id: 'dog-2', name: 'Zeus', ownerId: 'person-1' }),
        makeDog({ id: 'dog-1', name: 'Bella', ownerId: 'person-1' }),
        makeDog({ id: 'dog-3', name: 'Max', ownerId: 'person-2' }),
      ];
      mockDogsTable.getAllDogs.mockResolvedValue(dogs);

      const result = await getDogsWithUpcomingShows('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).name).toBe('Bella');
      expect((result.data[1] as Record<string, unknown>).name).toBe('Zeus');
    });

    it('returns empty array when no dogs match', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([]);

      const result = await getDogsWithUpcomingShows('person-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getDogStatistics
  // -----------------------------------------------------------------------
  describe('getDogStatistics', () => {
    it('returns total count of dogs matching ownership', async () => {
      const dogs = [
        makeDog({ id: 'dog-1', ownerId: 'person-1' }),
        makeDog({ id: 'dog-2', ownerId: 'person-1' }),
        makeDog({ id: 'dog-3', ownerId: 'person-2' }),
      ];
      mockDogsTable.getAllDogs.mockResolvedValue(dogs);

      const result = await getDogStatistics('person-1');

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ total: 2 });
    });

    it('returns 0 when no dogs match', async () => {
      mockDogsTable.getAllDogs.mockResolvedValue([]);

      const result = await getDogStatistics('person-1');

      expect(result.data).toEqual({ total: 0 });
      expect(result.error).toBeNull();
    });
  });
});
