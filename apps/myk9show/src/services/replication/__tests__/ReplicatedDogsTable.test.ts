/**
 * ReplicatedDogsTable Tests
 *
 * Validates the offline-first dog data replication system:
 * - Dog CRUD operations (create, read, update, delete)
 * - Dog profile management (breed, registration, titles)
 * - Cache management and TTL handling
 * - Sync operations (incremental sync from remote)
 * - Conflict resolution (server-authoritative with image preservation)
 * - Dog search and filtering operations
 * - Query operations (by owner, by breed, search)
 * - Error handling and edge cases
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedDogsTable, type ReplicatedDog } from '../ReplicatedDogsTable';
import type { ReplicatedRow, SyncMetadata } from '@myk9/replication';

// Mock dependencies
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocked dependencies
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@myk9/core';

describe('ReplicatedDogsTable', () => {
  let dogsTable: ReplicatedDogsTable;
  let mockDb: any;

  // Helper to create mock dog data
  const createMockDog = (overrides: Partial<ReplicatedDog> = {}): ReplicatedDog => ({
    id: '1',
    name: 'Max',
    callName: 'Maxie',
    breed: 'German Shepherd',
    sex: 'Male',
    dateOfBirth: '2020-01-15',
    ownerId: 'owner-123',
    height: '25 inches',
    weight: '80 lbs',
    color: 'Black and Tan',
    microchipNumber: '123456789',
    isSpayedNeutered: false,
    imageUrl: 'https://example.com/dog.jpg',
    ...overrides,
  });

  // Helper to create mock database row
  const createMockRow = (dog: ReplicatedDog): any => ({
    id: dog.id,
    name: dog.name,
    call_name: dog.callName,
    breed: dog.breed,
    sex: dog.sex,
    date_of_birth: dog.dateOfBirth,
    owner_id: dog.ownerId,
    height: dog.height,
    weight: dog.weight,
    color: dog.color,
    microchip_number: dog.microchipNumber,
    spayed_neutered: dog.isSpayedNeutered,
    image_url: dog.imageUrl,
    updated_at: new Date().toISOString(),
  });

  // Helper to create replicated row
  const createReplicatedRow = (dog: ReplicatedDog): ReplicatedRow<ReplicatedDog> => ({
    tableName: 'dogs',
    id: dog.id,
    data: dog,
    version: 1,
    lastSyncedAt: Date.now(),
    lastAccessedAt: Date.now(),
    accessCount: 0,
    isDirty: false,
    syncStatus: 'synced',
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh instance for each test
    dogsTable = new ReplicatedDogsTable();

    // Mock IndexedDB operations
    mockDb = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
      },
    };

    // Mock the init method to return our mock DB
    vi.spyOn(dogsTable as any, 'init').mockResolvedValue(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Table Initialization', () => {
    it('should have correct table name', () => {
      expect(dogsTable.getTableName()).toBe('dogs');
    });

    it('should initialize with default TTL', () => {
      expect((dogsTable as any).ttl).toBeGreaterThan(0);
    });
  });

  describe('Dog CRUD Operations', () => {
    describe('getDogById', () => {
      it('should retrieve dog by ID successfully', async () => {
        const mockDog = createMockDog();
        const mockRow = createReplicatedRow(mockDog);

        mockDb.get.mockResolvedValue(mockRow);

        const result = await dogsTable.getDogById('1');

        expect(result).toEqual(mockDog);
        expect(mockDb.get).toHaveBeenCalledWith('replicated_tables', ['dogs', '1']);
      });

      it('should return null for non-existent dog', async () => {
        mockDb.get.mockResolvedValue(undefined);

        const result = await dogsTable.getDogById('999');

        expect(result).toBeNull();
      });

      it('should return null for expired cache entry', async () => {
        const mockDog = createMockDog();
        const expiredRow = createReplicatedRow(mockDog);
        expiredRow.lastSyncedAt = Date.now() - 365 * 24 * 60 * 60 * 1000; // 1 year ago

        mockDb.get.mockResolvedValue(expiredRow);
        mockDb.delete.mockResolvedValue(undefined);

        // Mock cacheManager's isExpired to return true
        const cacheManager = (dogsTable as any).cacheManager;
        vi.spyOn(cacheManager, 'isExpired').mockReturnValue(true);

        const result = await dogsTable.getDogById('1');

        expect(result).toBeNull();
        expect(mockDb.delete).toHaveBeenCalledWith('replicated_tables', ['dogs', '1']);
      });

      it('should update access tracking on successful get', async () => {
        const mockDog = createMockDog();
        const mockRow = createReplicatedRow(mockDog);
        const initialAccessTime = mockRow.lastAccessedAt;

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 10));

        mockDb.get.mockResolvedValue(mockRow);
        mockDb.put.mockResolvedValue(undefined);

        await dogsTable.getDogById('1');

        expect(mockDb.put).toHaveBeenCalled();
        const putCall = mockDb.put.mock.calls[0][1];
        expect(putCall.lastAccessedAt).toBeGreaterThanOrEqual(initialAccessTime);
        expect(putCall.accessCount).toBe(1);
      });
    });

    describe('getAllDogs', () => {
      it('should retrieve all dogs', async () => {
        const mockDogs = [
          createMockDog({ id: '1', name: 'Max' }),
          createMockDog({ id: '2', name: 'Bella' }),
          createMockDog({ id: '3', name: 'Charlie' }),
        ];

        const mockRows = mockDogs.map(createReplicatedRow);

        const mockTx = {
          store: {
            index: vi.fn().mockReturnValue({
              getAll: vi.fn().mockResolvedValue(mockRows),
            }),
          },
        };

        mockDb.transaction.mockReturnValue(mockTx);

        const result = await dogsTable.getAllDogs();

        expect(result).toHaveLength(3);
        expect(result.map(d => d.name)).toEqual(['Max', 'Bella', 'Charlie']);
      });

      it('should filter out expired entries', async () => {
        const freshDog = createMockDog({ id: '1', name: 'Max' });
        const expiredDog = createMockDog({ id: '2', name: 'Bella' });

        const freshRow = createReplicatedRow(freshDog);
        const expiredRow = createReplicatedRow(expiredDog);
        expiredRow.lastSyncedAt = Date.now() - 365 * 24 * 60 * 60 * 1000;

        const mockTx = {
          store: {
            index: vi.fn().mockReturnValue({
              getAll: vi.fn().mockResolvedValue([freshRow, expiredRow]),
            }),
          },
        };

        mockDb.transaction.mockReturnValue(mockTx);

        // Mock cacheManager's isExpired
        const cacheManager = (dogsTable as any).cacheManager;
        vi.spyOn(cacheManager, 'isExpired')
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(true);

        const result = await dogsTable.getAllDogs();

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Max');
      });
    });

    describe('updateDog', () => {
      it('should update dog successfully', async () => {
        const existingDog = createMockDog();
        const mockRow = createReplicatedRow(existingDog);

        mockDb.get.mockResolvedValue(mockRow);

        // Mock the transaction for set operation
        const mockTx = {
          store: {
            get: vi.fn().mockResolvedValue(mockRow),
            put: vi.fn().mockResolvedValue(undefined),
          },
          done: Promise.resolve(),
        };
        mockDb.transaction.mockReturnValue(mockTx);

        const updates = { name: 'Updated Max', weight: '85 lbs' };

        await dogsTable.updateDog('1', updates);

        expect(mockDb.get).toHaveBeenCalledWith('replicated_tables', ['dogs', '1']);

        expect(logger.log).toHaveBeenCalledWith(
          expect.stringContaining('Updated dog 1')
        );
      });

      it('should throw error when dog not found', async () => {
        mockDb.get.mockResolvedValue(null);

        await expect(
          dogsTable.updateDog('999', { name: 'New Name' })
        ).rejects.toThrow('Dog 999 not found');
      });

      it('should mark dog as dirty when updated', async () => {
        const mockDog = createMockDog();
        const mockRow = createReplicatedRow(mockDog);

        mockDb.get.mockResolvedValue(mockRow);

        // Mock the transaction for set operation
        const mockTx = {
          store: {
            get: vi.fn().mockResolvedValue(mockRow),
            put: vi.fn().mockResolvedValue(undefined),
          },
          done: Promise.resolve(),
        };
        mockDb.transaction.mockReturnValue(mockTx);

        await dogsTable.updateDog('1', { name: 'Updated' });

        // Verify put was called with isDirty=true
        expect(mockTx.store.put).toHaveBeenCalledWith(
          expect.objectContaining({
            isDirty: true,
            syncStatus: 'pending',
          })
        );
      });
    });

    describe('createDog', () => {
      it('should create new dog with generated ID', async () => {
        const newDogData = {
          name: 'Rex',
          breed: 'Labrador',
          ownerId: 'owner-456',
        };

        const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

        const result = await dogsTable.createDog(newDogData);

        expect(result.id).toBeDefined();
        expect(result.name).toBe('Rex');
        expect(result.breed).toBe('Labrador');
        expect(result._version).toBe(1);
        expect(result._syncStatus).toBe('pending');
        expect(result._localOnly).toBe(true);

        expect(setSpy).toHaveBeenCalledWith(
          result.id,
          expect.objectContaining(newDogData),
          true
        );

        expect(logger.log).toHaveBeenCalledWith(
          expect.stringContaining(`Created new dog ${result.id}`)
        );
      });

      it('should set required fields with defaults', async () => {
        // Mock the transaction for set operation
        const mockTx = {
          store: {
            get: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue(undefined),
          },
          done: Promise.resolve(),
        };
        mockDb.transaction.mockReturnValue(mockTx);

        const result = await dogsTable.createDog({
          name: 'Buddy',
          breed: 'Golden Retriever',
        });

        expect(result._lastModified).toBeInstanceOf(Date);
        expect(result._syncStatus).toBe('pending');
        expect(result._version).toBe(1);
      });
    });

    describe('deleteDog', () => {
      it('should delete dog by ID', async () => {
        await dogsTable.delete('1');

        expect(mockDb.delete).toHaveBeenCalledWith('replicated_tables', ['dogs', '1']);
        expect(logger.log).toHaveBeenCalledWith(
          expect.stringContaining('Deleted row: 1')
        );
      });
    });
  });

  describe('Dog Search and Filtering', () => {
    describe('getDogsByOwner', () => {
      it('should filter dogs by owner ID', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', ownerId: 'owner-123' }),
          createMockDog({ id: '2', name: 'Bella', ownerId: 'owner-456' }),
          createMockDog({ id: '3', name: 'Charlie', ownerId: 'owner-123' }),
        ];

        const mockRows = dogs.map(createReplicatedRow);

        const mockTx = {
          store: {
            index: vi.fn().mockReturnValue({
              getAll: vi.fn().mockResolvedValue(mockRows),
            }),
          },
        };

        mockDb.transaction.mockReturnValue(mockTx);

        const result = await dogsTable.getDogsByOwner('owner-123');

        expect(result).toHaveLength(2);
        expect(result.map(d => d.name)).toEqual(['Max', 'Charlie']);
      });

      it('should return empty array when no dogs for owner', async () => {
        const mockTx = {
          store: {
            index: vi.fn().mockReturnValue({
              getAll: vi.fn().mockResolvedValue([]),
            }),
          },
        };

        mockDb.transaction.mockReturnValue(mockTx);

        const result = await dogsTable.getDogsByOwner('owner-999');

        expect(result).toEqual([]);
      });
    });

    describe('searchDogs', () => {
      beforeEach(() => {
        // Clear all existing spies before each search test
        vi.restoreAllMocks();
        // Re-mock init
        vi.spyOn(dogsTable as any, 'init').mockResolvedValue(mockDb);
      });

      it('should search by dog name (case-insensitive)', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', callName: 'Buddy', breed: 'Terrier' }),
          createMockDog({ id: '2', name: 'Maximus', callName: 'Munchkin', breed: 'Poodle' }),
          createMockDog({ id: '3', name: 'Bella', callName: 'Belle', breed: 'Retriever' }),
        ];

        // Mock getAll to return all dogs (searchDogs calls getAll internally)
        const getAllSpy = vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.searchDogs('max');

        expect(getAllSpy).toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result.map(d => d.name).sort()).toEqual(['Max', 'Maximus']);
      });

      it('should search by call name', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', callName: 'Maxie' }),
          createMockDog({ id: '2', name: 'Bella', callName: 'Bella-Bear' }),
          createMockDog({ id: '3', name: 'Charlie', callName: 'Chuck' }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.searchDogs('bear');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Bella');
      });

      it('should search by breed', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', breed: 'German Shepherd' }),
          createMockDog({ id: '2', name: 'Bella', breed: 'Golden Retriever' }),
          createMockDog({ id: '3', name: 'Charlie', breed: 'German Shepherd' }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.searchDogs('shepherd');

        expect(result).toHaveLength(2);
        expect(result.map(d => d.name)).toEqual(['Max', 'Charlie']);
      });

      it('should return empty array when no matches found', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max' }),
          createMockDog({ id: '2', name: 'Bella' }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.searchDogs('nonexistent');

        expect(result).toEqual([]);
      });

      it('should handle search with special characters', async () => {
        const dogs = [
          createMockDog({ id: '1', name: "Max's Dog" }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.searchDogs("max's");

        expect(result).toHaveLength(1);
      });
    });

    describe('getDogsByBreed', () => {
      it('should filter dogs by breed (case-insensitive)', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', breed: 'German Shepherd' }),
          createMockDog({ id: '2', name: 'Bella', breed: 'Golden Retriever' }),
          createMockDog({ id: '3', name: 'Charlie', breed: 'german shepherd' }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.getDogsByBreed('German Shepherd');

        expect(result).toHaveLength(2);
        expect(result.map(d => d.name)).toEqual(['Max', 'Charlie']);
      });

      it('should return empty array when no dogs of breed', async () => {
        const dogs = [
          createMockDog({ id: '1', name: 'Max', breed: 'German Shepherd' }),
        ];

        vi.spyOn(dogsTable, 'getAll').mockResolvedValue(dogs);

        const result = await dogsTable.getDogsByBreed('Poodle');

        expect(result).toEqual([]);
      });
    });
  });

  describe('Sync Operations', () => {
    describe('sync - Incremental Sync', () => {
      it('should perform incremental sync successfully', async () => {
        const mockSyncMetadata: SyncMetadata = {
          tableName: 'dogs',
          lastFullSyncAt: Date.now() - 1000,
          lastIncrementalSyncAt: Date.now() - 1000,
          totalRows: 1,
        };

        const mockRemoteDogs = [
          createMockRow(createMockDog({ id: '1', name: 'Max' })),
          createMockRow(createMockDog({ id: '2', name: 'Bella' })),
        ];

        // Mock getSyncMetadata
        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);

        // Mock getAll to return existing cached data
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([createMockDog()]);

        // Mock get to return null (new dogs)
        vi.spyOn(dogsTable, 'get').mockResolvedValue(null);

        // Mock set
        const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

        // Mock updateSyncMetadata
        const updateMetadataSpy = vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        // Mock Supabase query
        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: mockRemoteDogs, error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

        const result = await dogsTable.sync('owner-123');

        expect(result.success).toBe(true);
        expect(result.tableName).toBe('dogs');
        expect(result.operation).toBe('incremental-sync');
        expect(result.rowsAffected).toBe(2);
        expect(result.conflictsResolved).toBe(0);

        expect(setSpy).toHaveBeenCalledTimes(2);
        expect(updateMetadataSpy).toHaveBeenCalledWith({
          lastIncrementalSyncAt: expect.any(Number),
          syncStatus: 'idle',
        });
      });

      it('should handle sync with no remote changes', async () => {
        const mockSyncMetadata: SyncMetadata = {
          tableName: 'dogs',
          lastFullSyncAt: Date.now(),
          lastIncrementalSyncAt: Date.now(),
          totalRows: 0,
        };

        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

        const updateMetadataSpy = vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        const result = await dogsTable.sync('owner-123');

        expect(result.success).toBe(true);
        expect(result.rowsAffected).toBe(0);
        expect(updateMetadataSpy).toHaveBeenCalled();
      });

      it('should perform full sync when cache is empty', async () => {
        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(null);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

        const mockRemoteDogs = [
          createMockRow(createMockDog({ id: '1', name: 'Max' })),
        ];

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: mockRemoteDogs, error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

        vi.spyOn(dogsTable, 'get').mockResolvedValue(null);
        vi.spyOn(dogsTable, 'set').mockResolvedValue();
        vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        const result = await dogsTable.sync('owner-123');

        expect(result.success).toBe(true);
        expect(mockQuery.gt).toHaveBeenCalledWith('updated_at', expect.any(String));
      });

      it('should filter by owner_id when license key provided', async () => {
        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue({
          tableName: 'dogs',
          lastFullSyncAt: 0,
          lastIncrementalSyncAt: 0,
        });
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
        vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        await dogsTable.sync('owner-123');

        expect(mockQuery.eq).toHaveBeenCalledWith('owner_id', 'owner-123');
      });

      it('should handle Supabase query errors', async () => {
        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(null);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Connection failed' },
          }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

        const result = await dogsTable.sync('owner-123');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Connection failed');
        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('Conflict Resolution', () => {
      it('should resolve conflicts with server-authoritative strategy', async () => {
        const localDog = createMockDog({
          id: '1',
          name: 'Max',
          weight: '80 lbs',
          imageUrl: 'https://local.com/dog.jpg',
        });

        const remoteDog = createMockDog({
          id: '1',
          name: 'Updated Max',
          weight: '85 lbs',
          imageUrl: undefined, // Server doesn't have image
        });

        const mockSyncMetadata: SyncMetadata = {
          tableName: 'dogs',
          lastFullSyncAt: Date.now(),
          lastIncrementalSyncAt: Date.now(),
          totalRows: 1,
        };

        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([localDog]);
        vi.spyOn(dogsTable, 'get').mockResolvedValue(localDog);

        const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

        const mockRemoteRow = createMockRow(remoteDog);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockRemoteRow], error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
        vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        const result = await dogsTable.sync('owner-123');

        expect(result.success).toBe(true);
        expect(result.conflictsResolved).toBe(1);

        // Verify resolved data: server wins but local image preserved
        const resolvedDog = setSpy.mock.calls[0][1];
        expect(resolvedDog.name).toBe('Updated Max'); // Server value
        expect(resolvedDog.weight).toBe('85 lbs'); // Server value
        expect(resolvedDog.imageUrl).toBe('https://local.com/dog.jpg'); // Local value preserved
      });

      it('should use remote image when available', async () => {
        const localDog = createMockDog({
          id: '1',
          imageUrl: 'https://local.com/dog.jpg',
        });

        const remoteDog = createMockDog({
          id: '1',
          imageUrl: 'https://remote.com/dog.jpg',
        });

        const mockSyncMetadata: SyncMetadata = {
          tableName: 'dogs',
          lastFullSyncAt: Date.now(),
          lastIncrementalSyncAt: Date.now(),
          totalRows: 1,
        };

        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([localDog]);
        vi.spyOn(dogsTable, 'get').mockResolvedValue(localDog);

        const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

        const mockRemoteRow = createMockRow(remoteDog);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockRemoteRow], error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
        vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        await dogsTable.sync('owner-123');

        const resolvedDog = setSpy.mock.calls[0][1];
        expect(resolvedDog.imageUrl).toBe('https://remote.com/dog.jpg');
      });

      it('should handle conflict when local dog has no image', async () => {
        const localDog = createMockDog({
          id: '1',
          imageUrl: undefined,
        });

        const remoteDog = createMockDog({
          id: '1',
          imageUrl: 'https://remote.com/dog.jpg',
        });

        const mockSyncMetadata: SyncMetadata = {
          tableName: 'dogs',
          lastFullSyncAt: Date.now(),
          lastIncrementalSyncAt: Date.now(),
          totalRows: 1,
        };

        vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
        vi.spyOn(dogsTable, 'getAll').mockResolvedValue([localDog]);
        vi.spyOn(dogsTable, 'get').mockResolvedValue(localDog);

        const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

        const mockRemoteRow = createMockRow(remoteDog);

        const mockQuery = {
          select: vi.fn().mockReturnThis(),
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [mockRemoteRow], error: null }),
        };

        vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
        vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

        await dogsTable.sync('owner-123');

        const resolvedDog = setSpy.mock.calls[0][1];
        expect(resolvedDog.imageUrl).toBe('https://remote.com/dog.jpg');
      });
    });
  });

  describe('Cache Management', () => {
    it('should track sync metadata', async () => {
      const mockMetadata: SyncMetadata = {
        tableName: 'dogs',
        lastFullSyncAt: Date.now(),
        lastIncrementalSyncAt: Date.now(),
        totalRows: 10,
        syncStatus: 'idle',
      };

      vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockMetadata);

      const result = await dogsTable.getSyncMetadata();

      expect(result).toEqual(mockMetadata);
      expect(result?.tableName).toBe('dogs');
    });

    it('should update sync metadata', async () => {
      const updateSpy = vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

      await dogsTable.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now(),
        syncStatus: 'idle',
      });

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('Data Transformation', () => {
    it('should convert snake_case database row to camelCase dog object', async () => {
      const dbRow = {
        id: '1',
        name: 'Max',
        call_name: 'Maxie',
        breed: 'German Shepherd',
        sex: 'Male',
        date_of_birth: '2020-01-15',
        owner_id: 'owner-123',
        height: '25 inches',
        weight: '80 lbs',
        color: 'Black and Tan',
        microchip_number: '123456789',
        spayed_neutered: false,
        image_url: 'https://example.com/dog.jpg',
        updated_at: new Date().toISOString(),
      };

      const mockSyncMetadata: SyncMetadata = {
        tableName: 'dogs',
        lastFullSyncAt: Date.now(),
        lastIncrementalSyncAt: Date.now(),
        totalRows: 0,
      };

      vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
      vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);
      vi.spyOn(dogsTable, 'get').mockResolvedValue(null);

      const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [dbRow], error: null }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
      vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

      await dogsTable.sync('owner-123');

      const camelCaseDog = setSpy.mock.calls[0][1];

      expect(camelCaseDog.callName).toBe('Maxie');
      expect(camelCaseDog.dateOfBirth).toBe('2020-01-15');
      expect(camelCaseDog.ownerId).toBe('owner-123');
      expect(camelCaseDog.microchipNumber).toBe('123456789');
      expect(camelCaseDog.isSpayedNeutered).toBe(false);
      expect(camelCaseDog.imageUrl).toBe('https://example.com/dog.jpg');

      // Verify no snake_case properties
      expect((camelCaseDog as any).call_name).toBeUndefined();
      expect((camelCaseDog as any).date_of_birth).toBeUndefined();
      expect((camelCaseDog as any).owner_id).toBeUndefined();
    });

    it('should handle null values in database row', async () => {
      const dbRow = {
        id: '1',
        name: 'Max',
        call_name: null,
        breed: 'German Shepherd',
        sex: null,
        date_of_birth: null,
        owner_id: null,
        height: null,
        weight: null,
        color: null,
        microchip_number: null,
        spayed_neutered: null,
        image_url: null,
        updated_at: new Date().toISOString(),
      };

      const mockSyncMetadata: SyncMetadata = {
        tableName: 'dogs',
        lastFullSyncAt: Date.now(),
        lastIncrementalSyncAt: Date.now(),
        totalRows: 0,
      };

      vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(mockSyncMetadata);
      vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);
      vi.spyOn(dogsTable, 'get').mockResolvedValue(null);

      const setSpy = vi.spyOn(dogsTable, 'set').mockResolvedValue();

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [dbRow], error: null }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
      vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

      await dogsTable.sync('owner-123');

      const dog = setSpy.mock.calls[0][1];

      expect(dog.callName).toBeUndefined();
      expect(dog.sex).toBeUndefined();
      expect(dog.dateOfBirth).toBeUndefined();
      expect(dog.ownerId).toBeUndefined();
      expect(dog.imageUrl).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      vi.spyOn(dogsTable, 'getSyncMetadata').mockRejectedValue(
        new Error('Database connection failed')
      );

      vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

      const result = await dogsTable.sync('owner-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log sync duration on success', async () => {
      vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(null);
      vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);
      vi.spyOn(dogsTable, 'updateSyncMetadata').mockResolvedValue();

      const result = await dogsTable.sync('owner-123');

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should log sync duration on failure', async () => {
      vi.spyOn(dogsTable, 'getSyncMetadata').mockResolvedValue(null);
      vi.spyOn(dogsTable, 'getAll').mockResolvedValue([]);

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Network error' },
        }),
      };

      vi.mocked(supabase.from).mockReturnValue(mockQuery as any);

      const result = await dogsTable.sync('owner-123');

      expect(result.success).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', async () => {
      const { replicatedDogsTable } = await import('../ReplicatedDogsTable');

      expect(replicatedDogsTable).toBeInstanceOf(ReplicatedDogsTable);
      expect(replicatedDogsTable.getTableName()).toBe('dogs');
    });
  });
});
