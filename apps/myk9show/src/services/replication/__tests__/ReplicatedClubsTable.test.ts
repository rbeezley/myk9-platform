/**
 * ReplicatedClubsTable Tests
 *
 * Validates offline-first club data replication for myK9Show:
 * - Club CRUD operations (create, read, update, delete)
 * - Club profile management (name, contact info, affiliations)
 * - Club search and filtering (by name, region, email, city)
 * - Cache management and invalidation
 * - Sync operations with conflict resolution (server-authoritative)
 * - Offline-first behavior (local mutations queued for sync)
 * - Data transformation (rowToClub conversion)
 * - Error handling and edge cases
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedClubsTable, type ReplicatedClub } from '../ReplicatedClubsTable';

// Mock dependencies
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          gt: vi.fn(() => ({
            order: vi.fn(() => ({
              // Chainable mock
            })),
          })),
        })),
      })),
    })),
  },
}));

vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ReplicatedClubsTable', () => {
  let table: ReplicatedClubsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();

    table = new ReplicatedClubsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  describe('Constructor Initialization', () => {
    it('should initialize with table name "clubs"', () => {
      expect(table.getTableName()).toBe('clubs');
    });

    it('should be an instance of ReplicatedClubsTable', () => {
      expect(table).toBeInstanceOf(ReplicatedClubsTable);
    });
  });

  describe('Club CRUD Operations', () => {
    describe('set and get', () => {
      it('should store and retrieve a club', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Dog Club',
          email: 'contact@testdogclub.com',
          phone: '555-1234',
          website: 'https://testdogclub.com',
          address: '123 Main St',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
        };

        await table.set('club-1', club);

        const result = await table.get('club-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('club-1');
        expect(result?.name).toBe('Test Dog Club');
        expect(result?.email).toBe('contact@testdogclub.com');
        expect(result?.phone).toBe('555-1234');
      });

      it('should return null for non-existent club', async () => {
        const result = await table.get('nonexistent-club');
        expect(result).toBeNull();
      });

      it('should update existing club', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Dog Club',
          email: 'contact@testdogclub.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);
        await table.set('club-1', { ...club, phone: '555-9999' });

        const result = await table.get('club-1');
        expect(result?.phone).toBe('555-9999');
      });

      it('should handle clubs with all fields populated', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Complete Dog Club',
          email: 'info@complete.com',
          phone: '555-1234',
          website: 'https://complete.com',
          description: 'A complete dog club for all breeds',
          logoUrl: 'https://complete.com/logo.png',
          address: '123 Main St',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-15T12:00:00Z',
        };

        await table.set('club-1', club);

        const result = await table.get('club-1');
        expect(result?.name).toBe('Complete Dog Club');
        expect(result?.description).toBe('A complete dog club for all breeds');
        expect(result?.logoUrl).toBe('https://complete.com/logo.png');
        expect(result?.website).toBe('https://complete.com');
        expect(result?.city).toBe('Portland');
        expect(result?.state).toBe('OR');
        expect(result?.zipCode).toBe('97201');
      });

      it('should handle clubs with minimal fields', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Minimal Club',
          email: '',
          phone: '',
        };

        await table.set('club-1', club);

        const result = await table.get('club-1');
        expect(result?.name).toBe('Minimal Club');
        expect(result?.email).toBe('');
        expect(result?.phone).toBe('');
        expect(result?.website).toBeUndefined();
        expect(result?.description).toBeUndefined();
      });
    });

    describe('getAll', () => {
      it('should return empty array when no clubs exist', async () => {
        const results = await table.getAll();
        expect(results).toEqual([]);
      });

      it('should return all clubs', async () => {
        const clubs: ReplicatedClub[] = [
          { id: 'club-1', name: 'Club One', email: 'one@club.com', phone: '555-0001' },
          { id: 'club-2', name: 'Club Two', email: 'two@club.com', phone: '555-0002' },
          { id: 'club-3', name: 'Club Three', email: 'three@club.com', phone: '555-0003' },
        ];

        for (const club of clubs) {
          await table.set(club.id, club);
        }

        const results = await table.getAll();
        expect(results).toHaveLength(3);
      });
    });

    describe('delete', () => {
      it('should remove a club from cache', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);
        await table.delete('club-1');

        const result = await table.get('club-1');
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent club', async () => {
        await expect(table.delete('nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Club-Specific Operations', () => {
    describe('getAllClubs', () => {
      it('should return clubs sorted by name', async () => {
        const clubs: ReplicatedClub[] = [
          { id: 'club-1', name: 'Zebra Club', email: 'z@club.com', phone: '555-0001' },
          { id: 'club-2', name: 'Alpha Club', email: 'a@club.com', phone: '555-0002' },
          { id: 'club-3', name: 'Mango Club', email: 'm@club.com', phone: '555-0003' },
        ];

        for (const club of clubs) {
          await table.set(club.id, club);
        }

        const results = await table.getAllClubs();
        expect(results).toHaveLength(3);
        expect(results[0].name).toBe('Alpha Club');
        expect(results[1].name).toBe('Mango Club');
        expect(results[2].name).toBe('Zebra Club');
      });

      it('should return empty array when no clubs exist', async () => {
        const results = await table.getAllClubs();
        expect(results).toEqual([]);
      });

      it('should handle case-insensitive sorting', async () => {
        const clubs: ReplicatedClub[] = [
          { id: 'club-1', name: 'beta Club', email: 'b@club.com', phone: '555-0001' },
          { id: 'club-2', name: 'Alpha Club', email: 'a@club.com', phone: '555-0002' },
          { id: 'club-3', name: 'gamma Club', email: 'g@club.com', phone: '555-0003' },
        ];

        for (const club of clubs) {
          await table.set(club.id, club);
        }

        const results = await table.getAllClubs();
        expect(results[0].name).toBe('Alpha Club');
        expect(results[1].name).toBe('beta Club');
        expect(results[2].name).toBe('gamma Club');
      });
    });

    describe('getClubById', () => {
      it('should retrieve club by ID successfully', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);

        const result = await table.getClubById('club-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('club-1');
        expect(result?.name).toBe('Test Club');
      });

      it('should return null for non-existent club', async () => {
        const result = await table.getClubById('nonexistent');
        expect(result).toBeNull();
      });
    });

    describe('searchClubs', () => {
      beforeEach(async () => {
        const clubs: ReplicatedClub[] = [
          {
            id: 'club-1',
            name: 'Seattle Canine Club',
            email: 'info@seattlecanine.com',
            phone: '555-0001',
            city: 'Seattle',
            state: 'WA',
          },
          {
            id: 'club-2',
            name: 'Portland Dog Association',
            email: 'contact@portlanddog.org',
            phone: '555-0002',
            city: 'Portland',
            state: 'OR',
          },
          {
            id: 'club-3',
            name: 'Northwest K9 Club',
            email: 'nw@k9club.com',
            phone: '555-0003',
            city: 'Seattle',
            state: 'WA',
          },
          {
            id: 'club-4',
            name: 'Bay Area Dog Club',
            email: 'info@bayareadog.com',
            phone: '555-0004',
            city: 'San Francisco',
            state: 'CA',
          },
        ];

        for (const club of clubs) {
          await table.set(club.id, club);
        }
      });

      it('should search clubs by name (case-insensitive)', async () => {
        const results = await table.searchClubs('canine');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Seattle Canine Club');
      });

      it('should search clubs by partial name', async () => {
        const results = await table.searchClubs('dog');
        expect(results).toHaveLength(2);
        const names = results.map(c => c.name).sort();
        expect(names).toEqual(['Bay Area Dog Club', 'Portland Dog Association']);
      });

      it('should search clubs by email', async () => {
        const results = await table.searchClubs('nw@k9club.com');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Northwest K9 Club');
      });

      it('should search clubs by email domain', async () => {
        const results = await table.searchClubs('.org');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Portland Dog Association');
      });

      it('should search clubs by city', async () => {
        const results = await table.searchClubs('seattle');
        expect(results).toHaveLength(2);
        const names = results.map(c => c.name).sort();
        expect(names).toEqual(['Northwest K9 Club', 'Seattle Canine Club']);
      });

      it('should return empty array when no matches found', async () => {
        const results = await table.searchClubs('nonexistent');
        expect(results).toEqual([]);
      });

      it('should return results sorted by name', async () => {
        const results = await table.searchClubs('club');
        expect(results.length).toBeGreaterThan(0);

        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].name.localeCompare(results[i].name)).toBeLessThanOrEqual(0);
        }
      });

      it('should handle special characters in search term', async () => {
        const club: ReplicatedClub = {
          id: 'club-5',
          name: "O'Malley's Dog Club",
          email: 'info@omalleys.com',
          phone: '555-0005',
        };
        await table.set('club-5', club);

        const results = await table.searchClubs("o'malley");
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe("O'Malley's Dog Club");
      });

      it('should handle empty search term', async () => {
        const results = await table.searchClubs('');
        expect(results).toHaveLength(4); // All clubs should match
      });

      it('should search across multiple fields', async () => {
        const results = await table.searchClubs('portland');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Portland Dog Association');
        expect(results[0].city).toBe('Portland');
      });
    });

    describe('updateClub', () => {
      it('should update club with partial data', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Original Club',
          email: 'original@club.com',
          phone: '555-1234',
          city: 'Seattle',
        };

        await table.set('club-1', club);
        await table.updateClub('club-1', { name: 'Updated Club', phone: '555-9999' });

        const result = await table.get('club-1');
        expect(result?.name).toBe('Updated Club');
        expect(result?.phone).toBe('555-9999');
        expect(result?.email).toBe('original@club.com'); // Unchanged
        expect(result?.city).toBe('Seattle'); // Unchanged
      });

      it('should mark club as pending sync after update', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);
        await table.updateClub('club-1', { phone: '555-9999' });

        const result = await table.get('club-1');
        expect(result?._syncStatus).toBe('pending');
      });

      it('should update lastModified timestamp on update', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);
        const before = await table.get('club-1');

        await new Promise(resolve => setTimeout(resolve, 10));

        await table.updateClub('club-1', { phone: '555-9999' });
        const after = await table.get('club-1');

        expect(after?._lastModified).toBeDefined();
        expect(after?._lastModified).not.toEqual(before?._lastModified);
      });

      it('should throw error when updating non-existent club', async () => {
        await expect(table.updateClub('nonexistent', { name: 'New Name' })).rejects.toThrow(
          'Club nonexistent not found'
        );
      });

      it('should allow updating all mutable fields', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Original Club',
          email: 'original@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);

        await table.updateClub('club-1', {
          name: 'Updated Club',
          email: 'updated@club.com',
          phone: '555-9999',
          website: 'https://updated.com',
          description: 'Updated description',
          logoUrl: 'https://updated.com/logo.png',
          address: '456 New St',
          city: 'Portland',
          state: 'OR',
          zipCode: '97201',
        });

        const result = await table.get('club-1');
        expect(result?.name).toBe('Updated Club');
        expect(result?.email).toBe('updated@club.com');
        expect(result?.phone).toBe('555-9999');
        expect(result?.website).toBe('https://updated.com');
        expect(result?.description).toBe('Updated description');
        expect(result?.logoUrl).toBe('https://updated.com/logo.png');
        expect(result?.address).toBe('456 New St');
        expect(result?.city).toBe('Portland');
        expect(result?.state).toBe('OR');
        expect(result?.zipCode).toBe('97201');
      });
    });

    describe('createClub', () => {
      it('should create new club with generated ID', async () => {
        const newClubData: Omit<ReplicatedClub, 'id'> = {
          name: 'New Dog Club',
          email: 'new@club.com',
          phone: '555-1234',
          city: 'Seattle',
          state: 'WA',
        };

        const result = await table.createClub(newClubData);

        expect(result.id).toBeDefined();
        expect(result.name).toBe('New Dog Club');
        expect(result.email).toBe('new@club.com');
        expect(result._version).toBe(1);
        expect(result._syncStatus).toBe('pending');
        expect(result._localOnly).toBe(true);
      });

      it('should set lastModified timestamp on create', async () => {
        const result = await table.createClub({
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        });

        expect(result._lastModified).toBeInstanceOf(Date);
      });

      it('should store created club in cache', async () => {
        const result = await table.createClub({
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        });

        const cached = await table.get(result.id);
        expect(cached).not.toBeNull();
        expect(cached?.name).toBe('Test Club');
      });

      it('should create club with all optional fields', async () => {
        const result = await table.createClub({
          name: 'Complete Club',
          email: 'complete@club.com',
          phone: '555-1234',
          website: 'https://complete.com',
          description: 'A complete club',
          logoUrl: 'https://complete.com/logo.png',
          address: '123 Main St',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
        });

        expect(result.website).toBe('https://complete.com');
        expect(result.description).toBe('A complete club');
        expect(result.logoUrl).toBe('https://complete.com/logo.png');
        expect(result.address).toBe('123 Main St');
        expect(result.zipCode).toBe('98101');
      });

      it('should generate unique IDs for multiple clubs', async () => {
        const club1 = await table.createClub({
          name: 'Club 1',
          email: 'club1@test.com',
          phone: '555-0001',
        });

        const club2 = await table.createClub({
          name: 'Club 2',
          email: 'club2@test.com',
          phone: '555-0002',
        });

        expect(club1.id).not.toBe(club2.id);
      });
    });

    describe('deleteClubLocal', () => {
      it('should delete club from local cache', async () => {
        const club: ReplicatedClub = {
          id: 'club-1',
          name: 'Test Club',
          email: 'test@club.com',
          phone: '555-1234',
        };

        await table.set('club-1', club);
        await table.deleteClubLocal('club-1');

        const result = await table.get('club-1');
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent club', async () => {
        await expect(table.deleteClubLocal('nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Sync Operations', () => {
    let supabaseMock: { from: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      const { supabase } = await import('@/services/database/supabaseClient');
      supabaseMock = supabase as unknown as { from: ReturnType<typeof vi.fn> };
    });

    it('should sync successfully with no remote changes', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('clubs');
      expect(result.rowsAffected).toBe(0);
    });

    it('should sync new clubs from remote', async () => {
      const remoteClubs = [
        {
          id: 'club-1',
          name: 'Seattle Dog Club',
          email: 'info@seattledog.com',
          phone: '555-1234',
          website: 'https://seattledog.com',
          description: 'A dog club in Seattle',
          logo_url: 'https://seattledog.com/logo.png',
          address: '123 Main St',
          city: 'Seattle',
          state: 'WA',
          zip_code: '98101',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-15T12:00:00Z',
          deleted_at: null,
          deleted_by: null,
        },
      ];

      const mockQueryChain = {
        data: remoteClubs,
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);

      const club = await table.get('club-1');
      expect(club).not.toBeNull();
      expect(club?.name).toBe('Seattle Dog Club');
      expect(club?.email).toBe('info@seattledog.com');
      expect(club?.logoUrl).toBe('https://seattledog.com/logo.png');
      expect(club?.city).toBe('Seattle');
      expect(club?.state).toBe('WA');
      expect(club?.zipCode).toBe('98101');
    });

    it('should resolve conflicts during sync', async () => {
      const localClub: ReplicatedClub = {
        id: 'club-1',
        name: 'Local Club Name',
        email: 'local@club.com',
        phone: '555-1234',
        city: 'Seattle',
      };
      await table.set('club-1', localClub);

      const remoteClubs = [
        {
          id: 'club-1',
          name: 'Remote Club Name',
          email: 'remote@club.com',
          phone: '555-9999',
          city: 'Portland',
          updated_at: new Date(Date.now() + 1000).toISOString(),
          deleted_at: null,
        },
      ];

      const mockQueryChain = {
        data: remoteClubs,
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      const club = await table.get('club-1');
      expect(club?.name).toBe('Remote Club Name');
      expect(club?.email).toBe('remote@club.com');
      expect(club?.phone).toBe('555-9999');
      expect(club?.city).toBe('Portland');
    });

    it('should handle sync errors gracefully', async () => {
      const mockQueryChain = {
        data: null,
        error: { message: 'Network error' },
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should exclude soft-deleted clubs during sync', async () => {
      const remoteClubs = [
        {
          id: 'club-1',
          name: 'Active Club',
          email: 'active@club.com',
          phone: '555-1234',
          updated_at: '2024-01-15T12:00:00Z',
          deleted_at: null,
        },
      ];

      const mockQueryChain = {
        data: remoteClubs,
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      expect(mockIs).toHaveBeenCalledWith('deleted_at', null);
    });

    it('should update sync metadata after successful sync', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const beforeSync = Date.now();
      await table.sync();
      const afterSync = Date.now();

      const metadata = await table.getSyncMetadata();
      expect(metadata?.lastIncrementalSyncAt).toBeGreaterThanOrEqual(beforeSync);
      expect(metadata?.lastIncrementalSyncAt).toBeLessThanOrEqual(afterSync);
      expect(metadata?.syncStatus).toBe('idle');
    });

    it('should perform incremental sync based on lastSyncedAt', async () => {
      await table.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now() - 60000,
        syncStatus: 'idle',
      });

      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      expect(mockGt).toHaveBeenCalled();
      const gtArg = mockGt.mock.calls[0][1];
      expect(typeof gtArg).toBe('string');
    });

    it('should perform full sync when cache is empty', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      expect(mockGt).toHaveBeenCalledWith('updated_at', expect.any(String));
    });

    it('should handle multiple clubs in single sync', async () => {
      const remoteClubs = [
        {
          id: 'club-1',
          name: 'Club One',
          email: 'one@club.com',
          phone: '555-0001',
          updated_at: '2024-01-15T12:00:00Z',
          deleted_at: null,
        },
        {
          id: 'club-2',
          name: 'Club Two',
          email: 'two@club.com',
          phone: '555-0002',
          updated_at: '2024-01-15T12:01:00Z',
          deleted_at: null,
        },
        {
          id: 'club-3',
          name: 'Club Three',
          email: 'three@club.com',
          phone: '555-0003',
          updated_at: '2024-01-15T12:02:00Z',
          deleted_at: null,
        },
      ];

      const mockQueryChain = {
        data: remoteClubs,
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(3);

      const allClubs = await table.getAll();
      expect(allClubs).toHaveLength(3);
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflict with server-wins strategy', async () => {
      const localClub: ReplicatedClub = {
        id: 'club-1',
        name: 'Local Name',
        email: 'local@club.com',
        phone: '555-1234',
        city: 'Seattle',
      };

      const remoteClub: ReplicatedClub = {
        id: 'club-1',
        name: 'Remote Name',
        email: 'remote@club.com',
        phone: '555-9999',
        city: 'Portland',
      };

      const resolveConflict = (
        table as unknown as {
          resolveConflict(local: ReplicatedClub, remote: ReplicatedClub): ReplicatedClub;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict(localClub, remoteClub);

      expect(resolved).toBe(remoteClub);
      expect(resolved.name).toBe('Remote Name');
      expect(resolved.email).toBe('remote@club.com');
      expect(resolved.phone).toBe('555-9999');
      expect(resolved.city).toBe('Portland');
    });

    it('should always prefer remote data in conflicts', async () => {
      const local: ReplicatedClub = {
        id: 'club-1',
        name: 'Local',
        email: 'local@club.com',
        phone: '555-1111',
        website: 'https://local.com',
        description: 'Local description',
      };

      const remote: ReplicatedClub = {
        id: 'club-1',
        name: 'Remote',
        email: 'remote@club.com',
        phone: '555-9999',
      };

      const resolveConflict2 = (
        table as unknown as {
          resolveConflict(local: ReplicatedClub, remote: ReplicatedClub): ReplicatedClub;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict2(local, remote);

      expect(resolved).toBe(remote);
      expect(resolved.name).toBe('Remote');
      expect(resolved.email).toBe('remote@club.com');
      expect(resolved.website).toBeUndefined();
      expect(resolved.description).toBeUndefined();
    });
  });

  describe('Data Transformation', () => {
    it('should transform database row to club with camelCase fields', async () => {
      const remoteClub = {
        id: 'club-1',
        name: 'Test Club',
        email: 'test@club.com',
        phone: '555-1234',
        website: 'https://test.com',
        description: 'Test description',
        logo_url: 'https://test.com/logo.png',
        address: '123 Main St',
        city: 'Seattle',
        state: 'WA',
        zip_code: '98101',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        deleted_at: null,
      };

      const mockQueryChain = {
        data: [remoteClub],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      const club = await table.get('club-1');
      expect(club?.name).toBe('Test Club');
      expect(club?.email).toBe('test@club.com');
      expect(club?.phone).toBe('555-1234');
      expect(club?.website).toBe('https://test.com');
      expect(club?.description).toBe('Test description');
      expect(club?.logoUrl).toBe('https://test.com/logo.png');
      expect(club?.address).toBe('123 Main St');
      expect(club?.city).toBe('Seattle');
      expect(club?.state).toBe('WA');
      expect(club?.zipCode).toBe('98101');
      expect(club?.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(club?.updatedAt).toBe('2024-01-15T12:00:00Z');
    });

    it('should handle null/undefined fields gracefully', async () => {
      const remoteClub = {
        id: 'club-1',
        name: 'Minimal Club',
        email: null,
        phone: null,
        website: null,
        description: null,
        logo_url: null,
        address: null,
        city: null,
        state: null,
        zip_code: null,
        created_at: null,
        updated_at: '2024-01-15T12:00:00Z',
        deleted_at: null,
      };

      const mockQueryChain = {
        data: [remoteClub],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      const club = await table.get('club-1');
      expect(club?.name).toBe('Minimal Club');
      expect(club?.email).toBe('');
      expect(club?.phone).toBe('');
      expect(club?.website).toBeUndefined();
      expect(club?.description).toBeUndefined();
      expect(club?.logoUrl).toBeUndefined();
      expect(club?.address).toBeUndefined();
      expect(club?.city).toBeUndefined();
      expect(club?.state).toBeUndefined();
      expect(club?.zipCode).toBeUndefined();
      expect(club?.createdAt).toBeUndefined();
      expect(club?.updatedAt).toBe('2024-01-15T12:00:00Z');
    });

    it('should convert empty strings to empty strings for required fields', async () => {
      const remoteClub = {
        id: 'club-1',
        name: 'Test Club',
        email: '',
        phone: '',
        updated_at: '2024-01-15T12:00:00Z',
        deleted_at: null,
      };

      const mockQueryChain = {
        data: [remoteClub],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync();

      const club = await table.get('club-1');
      expect(club?.email).toBe('');
      expect(club?.phone).toBe('');
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const clubs: ReplicatedClub[] = [
        { id: 'club-1', name: 'Club One', email: 'one@club.com', phone: '555-0001' },
        { id: 'club-2', name: 'Club Two', email: 'two@club.com', phone: '555-0002' },
        { id: 'club-3', name: 'Club Three', email: 'three@club.com', phone: '555-0003' },
      ];

      for (const club of clubs) {
        await table.set(club.id, club);
      }

      const stats = await table.getCacheStats();

      expect(stats.rowCount).toBe(3);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      const clubs: ReplicatedClub[] = [
        { id: 'club-1', name: 'Club One', email: 'one@club.com', phone: '555-0001' },
        { id: 'club-2', name: 'Club Two', email: 'two@club.com', phone: '555-0002' },
      ];

      for (const club of clubs) {
        await table.set(club.id, club);
      }

      await table.clearCache();

      const results = await table.getAll();
      expect(results).toEqual([]);
    });

    it('should track dirty clubs after updates', async () => {
      const club: ReplicatedClub = {
        id: 'club-1',
        name: 'Test Club',
        email: 'test@club.com',
        phone: '555-1234',
      };

      await table.set('club-1', club);
      await table.updateClub('club-1', { phone: '555-9999' });

      const stats = await table.getCacheStats();
      expect(stats.dirtyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Subscription and Reactivity', () => {
    it('should notify subscribers on data changes', async () => {
      const callback = vi.fn();
      table.subscribe(callback);

      await new Promise(resolve => setTimeout(resolve, 50));

      callback.mockClear();

      await table.set('club-1', { id: 'club-1', name: 'Test', email: '', phone: '' });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', async () => {
      const callback = vi.fn();
      const unsubscribe = table.subscribe(callback);

      await new Promise(resolve => setTimeout(resolve, 50));

      unsubscribe();
      callback.mockClear();

      await table.set('club-1', { id: 'club-1', name: 'Test', email: '', phone: '' });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle clubs with all optional fields undefined', async () => {
      const minimalClub: ReplicatedClub = {
        id: 'club-1',
        name: 'Minimal Club',
        email: '',
        phone: '',
      };

      await table.set('club-1', minimalClub);

      const result = await table.get('club-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('club-1');
      expect(result?.name).toBe('Minimal Club');
    });

    it('should handle concurrent updates to same club', async () => {
      const club: ReplicatedClub = {
        id: 'club-1',
        name: 'Test Club',
        email: 'test@club.com',
        phone: '555-1234',
      };

      await table.set('club-1', club);

      const updates = [
        table.updateClub('club-1', { phone: '555-1111' }),
        table.updateClub('club-1', { phone: '555-2222' }),
        table.updateClub('club-1', { phone: '555-3333' }),
      ];

      await Promise.all(updates);

      const result = await table.get('club-1');
      expect(result?.phone).toMatch(/^555-(1111|2222|3333)$/);
    });

    it('should handle empty string IDs', async () => {
      const club: ReplicatedClub = {
        id: '',
        name: 'Empty ID Club',
        email: 'empty@club.com',
        phone: '555-1234',
      };

      await table.set('', club);

      const result = await table.get('');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('');
    });

    it('should handle special characters in string fields', async () => {
      const club: ReplicatedClub = {
        id: 'club-1',
        name: "O'Malley's Dog Club <script>",
        email: 'test+tag@club.com',
        phone: '(555) 123-4567',
        website: 'https://club.com?param=value&other=123',
        description: 'Description with "quotes" & ampersands',
      };

      await table.set('club-1', club);

      const result = await table.get('club-1');
      expect(result?.name).toBe("O'Malley's Dog Club <script>");
      expect(result?.email).toBe('test+tag@club.com');
      expect(result?.phone).toBe('(555) 123-4567');
      expect(result?.description).toBe('Description with "quotes" & ampersands');
    });

    it('should handle very long club names', async () => {
      const longName = 'A'.repeat(500);
      const club: ReplicatedClub = {
        id: 'club-1',
        name: longName,
        email: 'test@club.com',
        phone: '555-1234',
      };

      await table.set('club-1', club);

      const result = await table.get('club-1');
      expect(result?.name).toBe(longName);
      expect(result?.name.length).toBe(500);
    });

    it('should handle unicode characters in club data', async () => {
      const club: ReplicatedClub = {
        id: 'club-1',
        name: 'Köln Hundeclub 犬クラブ',
        email: 'test@köln-club.de',
        phone: '555-1234',
        city: 'München',
        description: 'Club with émojis 🐕 🏆',
      };

      await table.set('club-1', club);

      const result = await table.get('club-1');
      expect(result?.name).toBe('Köln Hundeclub 犬クラブ');
      expect(result?.email).toBe('test@köln-club.de');
      expect(result?.city).toBe('München');
      expect(result?.description).toBe('Club with émojis 🐕 🏆');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complete club lifecycle', async () => {
      const newClub = await table.createClub({
        name: 'New Club',
        email: 'new@club.com',
        phone: '555-1234',
        city: 'Seattle',
      });

      expect(newClub._syncStatus).toBe('pending');
      expect(newClub._localOnly).toBe(true);

      await table.updateClub(newClub.id, {
        website: 'https://newclub.com',
        description: 'Updated description',
      });

      let result = await table.get(newClub.id);
      expect(result?.website).toBe('https://newclub.com');
      expect(result?.description).toBe('Updated description');

      await table.updateClub(newClub.id, { phone: '555-9999' });

      result = await table.get(newClub.id);
      expect(result?.phone).toBe('555-9999');

      await table.deleteClubLocal(newClub.id);

      result = await table.get(newClub.id);
      expect(result).toBeNull();
    });

    it('should handle batch club creation', async () => {
      const clubData = Array.from({ length: 10 }, (_, i) => ({
        name: `Club ${i + 1}`,
        email: `club${i + 1}@test.com`,
        phone: `555-000${i}`,
        city: i % 2 === 0 ? 'Seattle' : 'Portland',
      }));

      const createdClubs = await Promise.all(clubData.map(data => table.createClub(data)));

      expect(createdClubs).toHaveLength(10);

      const allClubs = await table.getAllClubs();
      expect(allClubs).toHaveLength(10);

      expect(allClubs.every(c => c._syncStatus === 'pending')).toBe(true);
    });

    it('should handle filtering clubs by multiple criteria', async () => {
      const clubs: ReplicatedClub[] = [
        {
          id: 'club-1',
          name: 'Seattle Club A',
          email: 'a@seattle.com',
          phone: '555-0001',
          city: 'Seattle',
          state: 'WA',
        },
        {
          id: 'club-2',
          name: 'Seattle Club B',
          email: 'b@seattle.com',
          phone: '555-0002',
          city: 'Seattle',
          state: 'WA',
        },
        {
          id: 'club-3',
          name: 'Portland Club A',
          email: 'a@portland.com',
          phone: '555-0003',
          city: 'Portland',
          state: 'OR',
        },
        {
          id: 'club-4',
          name: 'Portland Club B',
          email: 'b@portland.com',
          phone: '555-0004',
          city: 'Portland',
          state: 'OR',
        },
      ];

      for (const club of clubs) {
        await table.set(club.id, club);
      }

      const seattleClubs = await table.searchClubs('seattle');
      expect(seattleClubs).toHaveLength(2);

      const portlandClubs = await table.searchClubs('portland');
      expect(portlandClubs).toHaveLength(2);

      const clubAResults = await table.searchClubs('Club A');
      expect(clubAResults).toHaveLength(2);

      const allClubs = await table.getAllClubs();
      expect(allClubs).toHaveLength(4);
    });

    it('should handle sync with mixed new and updated clubs', async () => {
      const existingClub: ReplicatedClub = {
        id: 'club-1',
        name: 'Existing Club',
        email: 'existing@club.com',
        phone: '555-1234',
      };
      await table.set('club-1', existingClub);

      const remoteClubs = [
        {
          id: 'club-1',
          name: 'Updated Existing Club',
          email: 'updated@club.com',
          phone: '555-9999',
          updated_at: new Date(Date.now() + 1000).toISOString(),
          deleted_at: null,
        },
        {
          id: 'club-2',
          name: 'New Club',
          email: 'new@club.com',
          phone: '555-5555',
          updated_at: new Date().toISOString(),
          deleted_at: null,
        },
      ];

      const mockQueryChain = {
        data: remoteClubs,
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockIs = vi.fn().mockReturnValue({ gt: mockGt });
      const mockSelect = vi.fn().mockReturnValue({ is: mockIs });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync();

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(2);
      expect(result.conflictsResolved).toBe(1);

      const updatedClub = await table.get('club-1');
      expect(updatedClub?.name).toBe('Updated Existing Club');
      expect(updatedClub?.email).toBe('updated@club.com');

      const newClub = await table.get('club-2');
      expect(newClub?.name).toBe('New Club');
      expect(newClub?.email).toBe('new@club.com');
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', async () => {
      const { replicatedClubsTable } = await import('../ReplicatedClubsTable');

      expect(replicatedClubsTable).toBeInstanceOf(ReplicatedClubsTable);
      expect(replicatedClubsTable.getTableName()).toBe('clubs');
    });
  });
});
