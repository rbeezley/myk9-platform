import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  forceDeleteDog,
  searchDogs,
  searchAllDogs,
  getDogStatistics,
} from '../../dogs';
import { mapDogInputToReplicated } from '@/services/mappers/dogMappers';
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
      getAllOrThrow: t(),
      get: t(),
    },
  };
});

vi.mock('@/services/replication/ReplicatedEntriesTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedEntriesTable: {
      getAll: t(),
      getAllOrThrow: t(),
      getEntriesByShow: t(),
      getEntriesByClass: t(),
    },
  };
});

vi.mock('@/services/replication/ReplicatedClassesTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedClassesTable: {
      get: t(),
      getAll: t(),
      get getAllOrThrow() {
        return this.getAll;
      },
    },
  };
});

vi.mock('@/services/replication/ReplicatedShowsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedShowsTable: {
      get: t(),
      getAll: t(),
      get getAllOrThrow() {
        return this.getAll;
      },
    },
  };
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
      // The server read attaches owners and registrations from batched lookups
      // (MYK9-1303); these mocks return the dog rows for every table, so no
      // people or registration row matches.
      expect(result.data).toEqual(
        mockDogs.map(dog => ({ ...dog, owner: null, registrations: [] }))
      );
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
      // getDogById adds the registration read's rows and completeness (MYK9-1126).
      expect(result.data).toMatchObject(mockDog);
      expect(result.error).toBeNull();
    });
  });

  describe('createDog', () => {
    it('should create a new dog', async () => {
      const newDog: DbDogInsert = {
        name: 'Charlie',
        call_name: 'Charlie',
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
        call_name: '',
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

    it('passes client-supplied id to Supabase INSERT', async () => {
      const newDog = {
        id: 'client-uuid-abc',
        name: 'Charlie',
        breed: 'Beagle',
        owner_id: '1',
        sex: 'male',
      } as DbDogInsert & { id: string };
      const mockCreatedDog = { ...newDog, owner: null };
      const chainable = createChainableQuery({ data: mockCreatedDog, error: null });
      mockSupabase.from.mockReturnValue(chainable);

      await createDog(newDog);

      const insertCall = fromAny<unknown[][], unknown>(chainable.insert.mock.calls)[0][0] as Array<
        Record<string, unknown>
      >;
      expect(insertCall[0]).toHaveProperty('id', 'client-uuid-abc');
    });
  });

  describe('mapDogInputToReplicated', () => {
    it('maps DogInput to ReplicatedDog with supplied id', () => {
      const input = {
        name: 'Daisy',
        breed: 'Beagle',
        sex: 'female' as const,
        ownerId: 'person-1',
        callName: 'Daisy',
        birthDate: '2021-03-15',
        color: 'tricolor',
        weight: 22,
        height: 13,
        microchipNumber: '123456789',
        imageUrl: 'https://example.com/daisy.jpg',
        spayedNeutered: true,
      };
      const result = mapDogInputToReplicated(input, 'dog-uuid-999');
      expect(result).toEqual({
        id: 'dog-uuid-999',
        name: 'Daisy',
        callName: 'Daisy',
        breed: 'Beagle',
        sex: 'female',
        dateOfBirth: '2021-03-15',
        ownerId: 'person-1',
        color: 'tricolor',
        weight: '22',
        height: '13',
        microchipNumber: '123456789',
        imageUrl: 'https://example.com/daisy.jpg',
        isSpayedNeutered: true,
        // Defaulted to match `mapDogInputToInsert`, so the locally-written row
        // reads back with the status the queued insert will give it.
        status: 'active',
      });
    });

    it('omits undefined optional fields', () => {
      const input = {
        name: 'Rex',
        breed: 'Lab',
        sex: 'male' as const,
        ownerId: 'person-2',
      };
      const result = mapDogInputToReplicated(input, 'dog-uuid-000');
      expect(result.id).toBe('dog-uuid-000');
      expect(result.name).toBe('Rex');
      // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL and the create RPC rejects a
      // dog without one. An input that supplied only `name` supplied the call
      // name, so it fills in here rather than leaving the required column unset.
      expect(result.callName).toBe('Rex');
      expect(result.dateOfBirth).toBeUndefined();
      expect(result.weight).toBeUndefined();
      expect(result.height).toBeUndefined();
    });
  });

  describe('updateDog', () => {
    it('should update a dog', async () => {
      const updates: DbDogUpdate = {
        name: 'Max Updated',
        weight: '75',
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

  describe('forceDeleteDog', () => {
    // The whole point of the admin override is that it reaches a DIFFERENT
    // function — force_delete_dog has no MK002 guard, soft_delete_dog does.
    // Calling the wrong one still typechecks, still resolves, and still looks
    // like a success in the UI; the only thing that changes is that the delete
    // silently fails to override anything. Pin the name.
    it('calls the force_delete_dog RPC, not soft_delete_dog', async () => {
      mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await forceDeleteDog('1');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('force_delete_dog', { p_dog_id: '1' });
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith('soft_delete_dog', expect.anything());
      expect(result.error).toBeNull();
    });

    // MYK9-600. `force_delete_dog` returns void: the SERVER stamps deleted_at
    // and deleted_by. Synthesising `{ deleted_at: new Date() }` from the client
    // clock here handed every consumer a timestamp that is not the one in the
    // row, and `restore_dog` keys on the exact `deleted_at` — so a value that
    // merely looks right is worse than no value at all.
    it('returns no row — the RPC is void and the server owns deleted_at/deleted_by', async () => {
      mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await forceDeleteDog('1');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('surfaces a permission denial as an error rather than a silent success', async () => {
      mockSupabase.rpc.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'Permission denied', code: '42501' },
        })
      );

      const result = await forceDeleteDog('1');

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
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
      expect(result.data).toEqual(mockResults.map(dog => ({ ...dog, registrations: [] })));
      expect(result.error).toBeNull();
    });
  });

  describe('searchAllDogs', () => {
    it('returns empty array without hitting the DB when query is shorter than 2 chars', async () => {
      const result = await searchAllDogs('a');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], error: null, hitLimit: false });
    });

    it('returns empty array when query is only whitespace', async () => {
      const result = await searchAllDogs('   ');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: [], error: null, hitLimit: false });
    });

    /** The dogs request's `.or(...)` calls: the dogs filter, then each embed's. */
    function orCalls(chain: ReturnType<typeof createChainableQuery>) {
      return vi.mocked(chain.or).mock.calls as Array<[string, { referencedTable?: string }?]>;
    }
    function embedFilter(chain: ReturnType<typeof createChainableQuery>, alias: string) {
      return orCalls(chain).find(([, opts]) => opts?.referencedTable === alias)?.[0];
    }

    it('queries dogs across the system (no ownership filter) in one request', async () => {
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

      // MYK9-2026 review: registrations and owners are matched through
      // filtered embeds of this one request, so nothing is capped before it.
      expect(mockSupabase.from.mock.calls).toEqual([['dogs']]);
      const [dogFilter] = orCalls(chain)[0] ?? [];
      expect(dogFilter).toContain('name.ilike."%rang%"');
      expect(dogFilter).toContain('search_0_registrations.not.is.null');
      expect(dogFilter).toContain('search_0_owner.not.is.null');
      expect(dogFilter).not.toContain('akc_number');
      // MYK9-90: registration number and registered name live on `dog_registrations`.
      expect(embedFilter(chain, 'search_0_registrations')).toBe(
        'registration_number.ilike."%rang%",registered_name.ilike."%rang%",breed.ilike."%rang%"'
      );
      expect(chain.is).toHaveBeenCalledWith('search_0_owner.deleted_at', null);
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(result.data).toEqual(mockResults);
      expect(result.error).toBeNull();
      expect(result.hitLimit).toBe(false);
    });

    // MYK9-2020: the secretary's search box says it finds a dog by its owner's
    // name. Her local roster is capped, so the system-wide search has to match
    // owners too, through the people rows she can already read.
    it("finds a dog by its owner's first or last name", async () => {
      const chain = createChainableQuery({ data: [{ id: 'd1' }], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await searchAllDogs('alice');

      expect(embedFilter(chain, 'search_0_owner')).toBe(
        'first_name.ilike."%alice%",last_name.ilike."%alice%"'
      );
    });

    it("finds a dog by its owner's full name", async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await searchAllDogs('Alice Smith');

      expect(embedFilter(chain, 'search_0_owner')).toBe(
        'first_name.ilike."%Alice Smith%",last_name.ilike."%Alice Smith%",and(first_name.ilike."%Alice%",last_name.ilike."%Smith%")'
      );
    });

    it('tries every first/last split of a full name, so a two-word first name is found', async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await searchAllDogs('Mary Jane Smith');

      const filter = embedFilter(chain, 'search_0_owner') ?? '';
      expect(filter).toContain('and(first_name.ilike."%Mary Jane%",last_name.ilike."%Smith%")');
      expect(filter).toContain('and(first_name.ilike."%Mary%",last_name.ilike."%Jane Smith%")');
    });

    it('tries at most three splits, keeping later words in the last name', async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await searchAllDogs('a b c d e');

      const filter = embedFilter(chain, 'search_0_owner') ?? '';
      expect(filter.match(/and\(/g)).toHaveLength(3);
      expect(filter).toContain('and(first_name.ilike."%a b c%",last_name.ilike."%d e%")');
    });

    // MYK9-2148: PostgREST has no backslash escape for `,` `(` `)`; a value
    // carrying them is double-quoted instead (checked against a real PostgREST
    // in src/utils/__tests__/sanitizePostgRESTFilter.test.ts).
    it('quotes a term with commas and parentheses in every filter', async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      const result = await searchAllDogs('Smith, Jo (Jr)');

      expect(embedFilter(chain, 'search_0_owner')).toBe(
        'first_name.ilike."%Smith, Jo (Jr)%",last_name.ilike."%Smith, Jo (Jr)%",and(first_name.ilike."%Smith%",last_name.ilike."%Jo Jr%"),and(first_name.ilike."%Smith Jo%",last_name.ilike."%Jr%")'
      );
      expect(embedFilter(chain, 'search_0_registrations')).toBe(
        'registration_number.ilike."%Smith, Jo (Jr)%",registered_name.ilike."%Smith, Jo (Jr)%",breed.ilike."%Smith, Jo (Jr)%"'
      );
      const [dogFilter] = orCalls(chain)[0] ?? [];
      expect(dogFilter).toContain('name.ilike."%Smith, Jo (Jr)%"');
      expect(dogFilter).not.toContain('\\,');
      expect(result.error).toBeNull();
    });

    it('escapes a typed quote, backslash and percent for the LIKE pattern', async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await searchAllDogs('5" a\\b 100%');

      const [dogFilter] = orCalls(chain)[0] ?? [];
      expect(dogFilter).toContain('name.ilike."%5\\" a\\\\\\\\b 100\\\\%%"');
    });

    it('reports the result as truncated only when the page of dogs is full', async () => {
      const dogs = Array.from({ length: 50 }, (_, i) => ({ id: `d${i}` }));
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: dogs, error: null }));

      const result = await searchAllDogs('an');

      expect(result.data).toHaveLength(50);
      expect(result.hitLimit).toBe(true);
    });

    // MYK9-90 review finding: a failed search must not be silently downgraded
    // to "no matches". Otherwise a broken backend is indistinguishable from
    // "no such dog", and the caller reports "not found" to the operator.
    it('propagates an error from the search instead of returning empty', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'PostgREST unavailable', code: '503' },
        })
      );

      const result = await searchAllDogs('rang');

      expect(result.error).not.toBeNull();
      expect(result.data).toEqual([]);
      expect(result.hitLimit).toBe(false);
    });

    it('flags hitLimit when the result count meets the requested limit', async () => {
      const mockResults = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        name: `Dog ${i}`,
      }));
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockResults, error: null }));

      const result = await searchAllDogs('dog', 5);

      expect(result.data).toHaveLength(5);
      expect(result.hitLimit).toBe(true);
    });

    it('surfaces database errors instead of throwing', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: { message: 'boom', code: 'X1' } })
      );

      const result = await searchAllDogs('foo');

      expect(result.data).toEqual([]);
      expect(result.error).not.toBeNull();
      expect(result.hitLimit).toBe(false);
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
      expect(result.data).toEqual(mockDogs.map(dog => ({ ...dog, registrations: [] })));
      expect(result.error).toBeNull();
    });
  });
});
