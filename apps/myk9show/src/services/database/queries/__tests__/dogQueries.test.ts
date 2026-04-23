import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  searchAllDogs,
  getDogStatistics,
} from '../dogQueries';
import type { DbDogInsert, DbDogUpdate } from '../../../../types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

// Force replication tables to throw so PostgREST fallback is exercised
vi.mock('@/services/replication/ReplicatedDogsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedDogsTable: {
      getAllDogs: t(),
      getDogById: t(),
      getDogsByOwner: t(),
      searchDogs: t(),
      getAll: t(),
      get: t(),
    },
  };
});

vi.mock('@/services/replication/ReplicatedEntriesTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedEntriesTable: {
      getAll: t(),
      getEntriesByShow: t(),
      getEntriesByClass: t(),
    },
  };
});

vi.mock('@/services/replication/ReplicatedClassesTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return { replicatedClassesTable: { get: t(), getAll: t() } };
});

vi.mock('@/services/replication/ReplicatedShowsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return { replicatedShowsTable: { get: t(), getAll: t() } };
});

const TEST_PERSON_ID = 'test-person-123';

describe('Dog Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllDogs', () => {
    it('should fetch all dogs with owner information', async () => {
      const mockDogs = [
        {
          id: '1',
          name: 'Max',
          breed: 'Golden Retriever',
          owner: { id: '1', first_name: 'John', last_name: 'Doe' },
        },
        {
          id: '2',
          name: 'Bella',
          breed: 'Labrador',
          owner: { id: '2', first_name: 'Jane', last_name: 'Smith' },
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockDogs, error: null }));

      const result = await getAllDogs(TEST_PERSON_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockDogs);
      expect(result.error).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const mockError = { message: 'Database connection failed' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllDogs(TEST_PERSON_ID);

      expect(result.data).toEqual([]);
      expect(result.error).toEqual(
        expect.objectContaining({
          message: 'Database connection failed',
        })
      );
    });
  });

  describe('getDogById', () => {
    it('should fetch a dog by ID with full details', async () => {
      const mockDog = {
        id: '1',
        name: 'Max',
        breed: 'Golden Retriever',
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
        registrations: [],
        health_records: [],
        entries: [],
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockDog, error: null }));

      const result = await getDogById('1');

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockDog);
      expect(result.error).toBeNull();
    });
  });

  describe('createDog', () => {
    it('should create a new dog', async () => {
      const newDog: DbDogInsert = {
        name: 'Charlie',
        breed: 'Beagle',
        owner_id: '1',
        sex: 'male',
        date_of_birth: '2020-01-01',
      };

      const mockCreatedDog = {
        id: '3',
        ...newDog,
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedDog, error: null })
      );

      const result = await createDog(newDog);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockCreatedDog);
      expect(result.error).toBeNull();
    });

    it('should handle validation errors', async () => {
      const invalidDog: DbDogInsert = {
        name: '',
        breed: 'Beagle',
        owner_id: '1',
        sex: 'male',
      };

      const mockError = {
        message: 'Invalid input',
        code: '23514',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await createDog(invalidDog);

      expect(result.data).toBeNull();
      expect(result.error).toEqual(
        expect.objectContaining({
          message: 'Invalid input',
        })
      );
    });
  });

  describe('updateDog', () => {
    it('should update a dog', async () => {
      const updates: DbDogUpdate = {
        name: 'Max Updated',
        weight: 75,
      };

      const mockUpdatedDog = {
        id: '1',
        name: 'Max Updated',
        weight: 75,
        breed: 'Golden Retriever',
        owner: { id: '1', first_name: 'John', last_name: 'Doe' },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockUpdatedDog, error: null })
      );

      const result = await updateDog('1', updates);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockUpdatedDog);
      expect(result.error).toBeNull();
    });
  });

  describe('deleteDog', () => {
    it('should soft delete a dog via RPC', async () => {
      mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await deleteDog('1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('soft_delete_dog', { p_dog_id: '1' });
      expect(result.data).toEqual(
        expect.objectContaining({
          id: '1',
          deleted_by: null,
        })
      );
      expect(result.data?.deleted_at).toBeDefined();
      expect(result.error).toBeNull();
    });
  });

  describe('searchDogs', () => {
    it('should search dogs by name, breed, or call name', async () => {
      const searchTerm = 'golden';
      const mockResults = [
        { id: '1', name: 'Golden Boy', breed: 'Golden Retriever' },
        { id: '2', name: 'Max', breed: 'Golden Retriever' },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockResults, error: null }));

      const result = await searchDogs(searchTerm, TEST_PERSON_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockResults);
      expect(result.error).toBeNull();
    });
  });

  describe('searchAllDogs', () => {
    it('returns empty array without hitting the DB when query is shorter than 2 chars', async () => {
      const result = await searchAllDogs('a');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], error: null });
    });

    it('returns empty array when query is only whitespace', async () => {
      const result = await searchAllDogs('   ');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], error: null });
    });

    it('queries dogs across the system (no ownership filter) on match', async () => {
      const mockResults = [
        {
          id: '1',
          name: 'Ranger',
          breed: 'Labrador',
          owner: { id: 'p1', first_name: 'Alice', last_name: 'Smith' },
        },
      ];
      const chain = createChainableQuery({ data: mockResults, error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await searchAllDogs('rang');

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('name.ilike.%rang%'));
      expect(chain.or).toHaveBeenCalledWith(expect.stringContaining('akc_number.ilike.%rang%'));
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(result.data).toEqual(mockResults);
      expect(result.error).toBeNull();
    });

    it('surfaces database errors instead of throwing', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: { message: 'boom', code: 'X1' } })
      );

      const result = await searchAllDogs('foo');

      expect(result.data).toEqual([]);
      expect(result.error).not.toBeNull();
    });
  });

  describe('getDogStatistics', () => {
    it('should get dog count statistics', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: null, count: 42 })
      );

      const result = await getDogStatistics(TEST_PERSON_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result).toEqual({
        data: { total: 42 },
        error: null,
      });
    });
  });

  describe('getDogsByOwner', () => {
    it('should fetch dogs by owner ID', async () => {
      const ownerId = '123';
      const mockDogs = [
        { id: '1', name: 'Max', owner_id: ownerId },
        { id: '2', name: 'Bella', owner_id: ownerId },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockDogs, error: null }));

      const result = await getDogsByOwner(ownerId);

      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
      expect(result.data).toEqual(mockDogs);
      expect(result.error).toBeNull();
    });
  });
});
