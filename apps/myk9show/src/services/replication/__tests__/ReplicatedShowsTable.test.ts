/**
 * ReplicatedShowsTable Tests
 *
 * Validates offline-first show data replication for myK9Show:
 * - Show CRUD operations (create, read, update, delete)
 * - Show lifecycle management (draft, active, completed, archived)
 * - Show filtering (by date, status, club)
 * - Cache management and invalidation
 * - Sync operations with conflict resolution
 * - Show metadata (venue, dates, judges, entry limits)
 * - Offline-first behavior (queue mutations when offline)
 * - Error handling and validation
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';

// Mock dependencies
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        gt: vi.fn(() => ({
          order: vi.fn(() => ({
            eq: vi.fn(() => ({
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

const TEST_CLUB_ID = 'club-123';

describe('ReplicatedShowsTable', () => {
  let table: ReplicatedShowsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();

    table = new ReplicatedShowsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  describe('Constructor Initialization', () => {
    it('should initialize with table name "shows"', () => {
      expect(table.getTableName()).toBe('shows');
    });

    it('should be an instance of ReplicatedShowsTable', () => {
      expect(table).toBeInstanceOf(ReplicatedShowsTable);
    });
  });

  describe('Show CRUD Operations', () => {
    describe('set and get', () => {
      it('should store and retrieve a show', async () => {
        const show: ReplicatedShow = {
          id: 'show-1',
          name: 'Annual Dog Show 2024',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
          location: 'Central Park',
          status: 'active',
          clubId: 'club-123',
        };

        await table.set('show-1', show);

        const result = await table.get('show-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('show-1');
        expect(result?.name).toBe('Annual Dog Show 2024');
        expect(result?.organization).toBe('Obedience');
        expect(result?.status).toBe('active');
      });

      it('should return null for non-existent show', async () => {
        const result = await table.get('nonexistent-show');
        expect(result).toBeNull();
      });

      it('should update existing show', async () => {
        const show: ReplicatedShow = {
          id: 'show-1',
          name: 'Test Show',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
          status: 'draft',
        };

        await table.set('show-1', show);
        await table.set('show-1', { ...show, status: 'active' });

        const result = await table.get('show-1');
        expect(result?.status).toBe('active');
      });

      it('should handle shows with full metadata', async () => {
        const show: ReplicatedShow = {
          id: 'show-1',
          name: 'Premium Dog Show',
          organization: 'Agility',
          startDate: '2024-08-01',
          endDate: '2024-08-02',
          location: 'Fairgrounds Arena',
          status: 'active',
          entryOpenDate: '2024-05-01',
          entryCloseDate: '2024-07-25',
          preEntryFee: 35.0,
          dayOfShowFee: 45.0,
          clubId: 'club-123',
          chairman: 'John Smith',
          secretary: 'Jane Doe',
          chiefSteward: 'Bob Johnson',
          maxEntriesPerDog: 3,
          maxTotalEntries: 150,
          allowsNonOwnerHandlers: true,
        };

        await table.set('show-1', show);

        const result = await table.get('show-1');
        expect(result?.chairman).toBe('John Smith');
        expect(result?.secretary).toBe('Jane Doe');
        expect(result?.chiefSteward).toBe('Bob Johnson');
        expect(result?.preEntryFee).toBe(35.0);
        expect(result?.dayOfShowFee).toBe(45.0);
        expect(result?.maxEntriesPerDog).toBe(3);
        expect(result?.maxTotalEntries).toBe(150);
        expect(result?.allowsNonOwnerHandlers).toBe(true);
      });

      it('should handle shows with minimal data', async () => {
        const show: ReplicatedShow = {
          id: 'show-1',
          name: 'Minimal Show',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
        };

        await table.set('show-1', show);

        const result = await table.get('show-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('show-1');
        expect(result?.name).toBe('Minimal Show');
        expect(result?.location).toBeUndefined();
        expect(result?.status).toBeUndefined();
      });
    });

    describe('getAll', () => {
      it('should return empty array when no shows exist', async () => {
        const results = await table.getAll();
        expect(results).toEqual([]);
      });

      it('should return all shows', async () => {
        const shows: ReplicatedShow[] = [
          {
            id: 'show-1',
            name: 'Show 1',
            organization: 'Obedience',
            startDate: '2024-06-15',
            endDate: '2024-06-16',
          },
          {
            id: 'show-2',
            name: 'Show 2',
            organization: 'Agility',
            startDate: '2024-07-15',
            endDate: '2024-07-16',
          },
          {
            id: 'show-3',
            name: 'Show 3',
            organization: 'Rally',
            startDate: '2024-08-15',
            endDate: '2024-08-16',
          },
        ];

        for (const show of shows) {
          await table.set(show.id, show);
        }

        const results = await table.getAll();
        expect(results).toHaveLength(3);
      });
    });

    describe('delete', () => {
      it('should remove a show from cache', async () => {
        const show: ReplicatedShow = {
          id: 'show-1',
          name: 'Test Show',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
        };

        await table.set('show-1', show);
        await table.delete('show-1');

        const result = await table.get('show-1');
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent show', async () => {
        await expect(table.delete('nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Show Lifecycle Management', () => {
    it('should handle draft to active transition', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        status: 'draft',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { status: 'active' });

      const result = await table.get('show-1');
      expect(result?.status).toBe('active');
    });

    it('should handle active to completed transition', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        status: 'active',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { status: 'completed' });

      const result = await table.get('show-1');
      expect(result?.status).toBe('completed');
    });

    it('should handle completed to archived transition', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        status: 'completed',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { status: 'archived' });

      const result = await table.get('show-1');
      expect(result?.status).toBe('archived');
    });

    it('should mark show as pending sync after status update', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        status: 'draft',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { status: 'active' });

      const result = await table.get('show-1');
      expect(result?._syncStatus).toBe('pending');
    });
  });

  describe('Show Queries and Filtering', () => {
    beforeEach(async () => {
      // Setup test data with various dates and statuses
      const shows: ReplicatedShow[] = [
        {
          id: 'show-1',
          name: 'Past Show',
          organization: 'Obedience',
          startDate: '2024-01-15',
          endDate: '2024-01-16',
          status: 'completed',
          clubId: 'club-123',
        },
        {
          id: 'show-2',
          name: 'Current Show',
          organization: 'Agility',
          startDate: new Date(Date.now() - 86400000).toISOString().split('T')[0], // Yesterday
          endDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
          status: 'active',
          clubId: 'club-123',
        },
        {
          id: 'show-3',
          name: 'Future Show 1',
          organization: 'Rally',
          startDate: '2026-06-15',
          endDate: '2026-06-16',
          status: 'draft',
          clubId: 'club-123',
        },
        {
          id: 'show-4',
          name: 'Future Show 2',
          organization: 'Obedience',
          startDate: '2026-08-15',
          endDate: '2026-08-16',
          status: 'active',
          clubId: 'club-456',
        },
      ];

      for (const show of shows) {
        await table.set(show.id, show);
      }
    });

    describe('getAllShows', () => {
      it('should return all shows sorted by start date', async () => {
        const results = await table.getAllShows();
        expect(results).toHaveLength(4);

        // Verify chronological order
        for (let i = 1; i < results.length; i++) {
          const prev = new Date(results[i - 1].startDate).getTime();
          const curr = new Date(results[i].startDate).getTime();
          expect(prev).toBeLessThanOrEqual(curr);
        }
      });

      it('should handle empty show list', async () => {
        // Create a completely new test context
        const { databaseManager } = await import('@myk9/replication');
        await databaseManager.reset();

        const emptyTable = new ReplicatedShowsTable();

        // Verify cache is truly empty before testing
        const allShows = await emptyTable.getAll();
        if (allShows.length > 0) {
          // Clear the cache if it's not empty
          await emptyTable.clearCache();
        }

        const results = await emptyTable.getAllShows();
        expect(results).toEqual([]);
      });
    });

    describe('getShowById', () => {
      it('should return show by ID', async () => {
        const result = await table.getShowById('show-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('show-1');
        expect(result?.name).toBe('Past Show');
      });

      it('should return null for non-existent ID', async () => {
        const result = await table.getShowById('nonexistent');
        expect(result).toBeNull();
      });
    });

    describe('getShowsByClub', () => {
      it('should filter shows by club ID', async () => {
        const results = await table.getShowsByClub('club-123');
        expect(results).toHaveLength(3);
        expect(results.every(show => show.clubId === 'club-123')).toBe(true);
      });

      it('should return empty array for non-existent club', async () => {
        const results = await table.getShowsByClub('club-999');
        expect(results).toEqual([]);
      });

      it('should sort club shows by start date', async () => {
        const results = await table.getShowsByClub('club-123');

        // Verify chronological order
        for (let i = 1; i < results.length; i++) {
          const prev = new Date(results[i - 1].startDate).getTime();
          const curr = new Date(results[i].startDate).getTime();
          expect(prev).toBeLessThanOrEqual(curr);
        }
      });
    });

    describe('getUpcomingShows', () => {
      it('should return only future shows', async () => {
        const results = await table.getUpcomingShows();
        const now = Date.now();

        expect(results.length).toBeGreaterThan(0);
        results.forEach(show => {
          const startTime = new Date(show.startDate).getTime();
          expect(startTime).toBeGreaterThanOrEqual(now);
        });
      });

      it('should sort upcoming shows by start date', async () => {
        const results = await table.getUpcomingShows();

        // Verify chronological order
        for (let i = 1; i < results.length; i++) {
          const prev = new Date(results[i - 1].startDate).getTime();
          const curr = new Date(results[i].startDate).getTime();
          expect(prev).toBeLessThanOrEqual(curr);
        }
      });

      it('should exclude past shows', async () => {
        const results = await table.getUpcomingShows();
        const pastShow = results.find(show => show.id === 'show-1');
        expect(pastShow).toBeUndefined();
      });
    });

    describe('getActiveShows', () => {
      it('should return only currently active shows', async () => {
        const results = await table.getActiveShows();
        const now = Date.now();

        results.forEach(show => {
          const startTime = new Date(show.startDate).getTime();
          const endTime = new Date(show.endDate).getTime();
          expect(startTime).toBeLessThanOrEqual(now);
          expect(endTime).toBeGreaterThanOrEqual(now);
        });
      });

      it('should include show happening today', async () => {
        const results = await table.getActiveShows();
        const currentShow = results.find(show => show.id === 'show-2');
        expect(currentShow).toBeDefined();
      });

      it('should exclude future shows', async () => {
        const results = await table.getActiveShows();
        const futureShows = results.filter(show => show.id === 'show-3' || show.id === 'show-4');
        expect(futureShows).toHaveLength(0);
      });

      it('should exclude past shows', async () => {
        const results = await table.getActiveShows();
        const pastShow = results.find(show => show.id === 'show-1');
        expect(pastShow).toBeUndefined();
      });

      it('should return empty array when no active shows', async () => {
        // Create a completely new test context
        const { databaseManager } = await import('@myk9/replication');
        await databaseManager.reset();

        const emptyTable = new ReplicatedShowsTable();

        // Verify cache is truly empty before testing
        const allShows = await emptyTable.getAll();
        if (allShows.length > 0) {
          // Clear the cache if it's not empty
          await emptyTable.clearCache();
        }

        const results = await emptyTable.getActiveShows();
        expect(results).toEqual([]);
      });
    });
  });

  describe('Show Updates', () => {
    it('should update show with partial data', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Original Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        location: 'Original Location',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', {
        name: 'Updated Show',
        location: 'New Location',
      });

      const result = await table.get('show-1');
      expect(result?.name).toBe('Updated Show');
      expect(result?.location).toBe('New Location');
      expect(result?.organization).toBe('Obedience'); // Unchanged
      expect(result?.startDate).toBe('2024-06-15'); // Unchanged
    });

    it('should mark show as dirty after update', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { name: 'Updated Show' });

      const result = await table.get('show-1');
      expect(result?._syncStatus).toBe('pending');
    });

    it('should throw error when updating non-existent show', async () => {
      await expect(table.updateShow('nonexistent', { name: 'Updated' })).rejects.toThrow(
        'Show nonexistent not found'
      );
    });

    it('should update lastModified timestamp on update', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);
      const before = await table.get('show-1');

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await table.updateShow('show-1', { name: 'Updated Show' });
      const after = await table.get('show-1');

      expect(after?._lastModified).toBeDefined();
      expect(after?._lastModified).not.toEqual(before?._lastModified);
    });

    it('should update entry dates and fees', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        preEntryFee: 30.0,
        dayOfShowFee: 40.0,
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', {
        entryOpenDate: '2024-05-01',
        entryCloseDate: '2024-06-10',
        preEntryFee: 35.0,
        dayOfShowFee: 45.0,
      });

      const result = await table.get('show-1');
      expect(result?.entryOpenDate).toBe('2024-05-01');
      expect(result?.entryCloseDate).toBe('2024-06-10');
      expect(result?.preEntryFee).toBe(35.0);
      expect(result?.dayOfShowFee).toBe(45.0);
    });

    it('should update show officials', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', {
        chairman: 'Alice Smith',
        secretary: 'Bob Jones',
        chiefSteward: 'Carol Williams',
      });

      const result = await table.get('show-1');
      expect(result?.chairman).toBe('Alice Smith');
      expect(result?.secretary).toBe('Bob Jones');
      expect(result?.chiefSteward).toBe('Carol Williams');
    });

    it('should update entry limits', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', {
        maxEntriesPerDog: 4,
        maxTotalEntries: 200,
        allowsNonOwnerHandlers: true,
      });

      const result = await table.get('show-1');
      expect(result?.maxEntriesPerDog).toBe(4);
      expect(result?.maxTotalEntries).toBe(200);
      expect(result?.allowsNonOwnerHandlers).toBe(true);
    });
  });

  describe('Show Creation', () => {
    it('should create new show with generated ID', async () => {
      const newShowData: Omit<ReplicatedShow, 'id'> = {
        name: 'New Show',
        organization: 'Agility',
        startDate: '2024-09-15',
        endDate: '2024-09-16',
        location: 'Event Center',
        clubId: 'club-123',
      };

      const result = await table.createShow(newShowData);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('New Show');
      expect(result.organization).toBe('Agility');
      expect(result._version).toBe(1);
      expect(result._syncStatus).toBe('pending');
      expect(result._localOnly).toBe(true);

      // Verify show was persisted
      const retrieved = await table.get(result.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('New Show');
    });

    it('should set metadata fields on creation', async () => {
      const result = await table.createShow({
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      });

      expect(result._lastModified).toBeInstanceOf(Date);
      expect(result._syncStatus).toBe('pending');
      expect(result._version).toBe(1);
      expect(result._localOnly).toBe(true);
    });

    it('should create show with full metadata', async () => {
      const result = await table.createShow({
        name: 'Premium Show',
        organization: 'Rally',
        startDate: '2024-10-15',
        endDate: '2024-10-16',
        location: 'Outdoor Arena',
        status: 'draft',
        entryOpenDate: '2024-08-01',
        entryCloseDate: '2024-10-10',
        preEntryFee: 40.0,
        dayOfShowFee: 50.0,
        clubId: 'club-456',
        chairman: 'David Lee',
        secretary: 'Emma Brown',
        chiefSteward: 'Frank Miller',
        maxEntriesPerDog: 5,
        maxTotalEntries: 250,
        allowsNonOwnerHandlers: false,
      });

      expect(result.chairman).toBe('David Lee');
      expect(result.secretary).toBe('Emma Brown');
      expect(result.chiefSteward).toBe('Frank Miller');
      expect(result.maxEntriesPerDog).toBe(5);
      expect(result.maxTotalEntries).toBe(250);
      expect(result.allowsNonOwnerHandlers).toBe(false);
    });
  });

  describe('Sync Operations', () => {
    let supabaseMock: { from: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      const { supabase } = await import('@/services/database/supabaseClient');
      supabaseMock = supabase as unknown as { from: ReturnType<typeof vi.fn> };
    });

    it('should sync successfully with no remote changes', async () => {
      // Mock empty response with proper query chain
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('shows');
      expect(result.rowsAffected).toBe(0);
      expect(result.operation).toBe('incremental-sync');
    });

    it('should sync new shows from remote', async () => {
      // Mock remote shows
      const remoteShows = [
        {
          id: 'show-1',
          name: 'Remote Show',
          organization: 'Obedience',
          start_date: '2024-06-15',
          end_date: '2024-06-16',
          location: 'Remote Location',
          status: 'active',
          entry_open_date: '2024-05-01',
          entry_close_date: '2024-06-10',
          pre_entry_fee: 35,
          day_of_show_fee: 45,
          club_id: 'club-123',
          chairman: 'John Doe',
          secretary: 'Jane Smith',
          chief_steward: 'Bob Wilson',
          max_entries_per_dog: 3,
          max_total_entries: 150,
          allow_non_owner_handlers: true,
          updated_at: '2024-01-01T10:00:00Z',
        },
      ];

      const mockQueryChain = {
        data: remoteShows,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
      expect(result.operation).toBe('incremental-sync');

      // Verify show was cached
      const show = await table.get('show-1');
      expect(show).not.toBeNull();
      expect(show?.name).toBe('Remote Show');
      expect(show?.organization).toBe('Obedience');
      expect(show?.startDate).toBe('2024-06-15');
      expect(show?.endDate).toBe('2024-06-16');
      expect(show?.chairman).toBe('John Doe');
      expect(show?.preEntryFee).toBe(35);
      expect(show?.maxEntriesPerDog).toBe(3);
    });

    it('should resolve conflicts during sync (server wins)', async () => {
      // Setup local show
      const localShow: ReplicatedShow = {
        id: 'show-1',
        name: 'Local Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        location: 'Local Location',
      };
      await table.set('show-1', localShow);

      // Mock remote show with different data
      const remoteShows = [
        {
          id: 'show-1',
          name: 'Remote Show',
          organization: 'Agility',
          start_date: '2024-06-20',
          end_date: '2024-06-21',
          location: 'Remote Location',
          updated_at: new Date(Date.now() + 1000).toISOString(),
        },
      ];

      const mockQueryChain = {
        data: remoteShows,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      // Server wins - remote data should be in cache
      const show = await table.get('show-1');
      expect(show?.name).toBe('Remote Show');
      expect(show?.organization).toBe('Agility');
      expect(show?.startDate).toBe('2024-06-20');
      expect(show?.location).toBe('Remote Location');
    });

    it('should handle sync errors gracefully', async () => {
      // Mock error response
      const mockQueryChain = {
        data: null,
        error: { message: 'Network error' },
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should filter by club_id during sync', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync(TEST_CLUB_ID);

      // Verify query construction
      expect(supabaseMock.from).toHaveBeenCalledWith('shows');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('club_id', TEST_CLUB_ID);
    });

    it('should update sync metadata after successful sync', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const beforeSync = Date.now();
      await table.sync(TEST_CLUB_ID);
      const afterSync = Date.now();

      const metadata = await table.getSyncMetadata();
      expect(metadata?.lastIncrementalSyncAt).toBeGreaterThanOrEqual(beforeSync);
      expect(metadata?.lastIncrementalSyncAt).toBeLessThanOrEqual(afterSync);
      expect(metadata?.syncStatus).toBe('idle');
    });

    it('should perform incremental sync based on lastSyncedAt', async () => {
      // Set last sync time
      await table.updateSyncMetadata({
        lastIncrementalSyncAt: Date.now() - 60000, // 1 minute ago
        syncStatus: 'idle',
      });

      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync(TEST_CLUB_ID);

      // Verify gt was called with a timestamp (incremental sync)
      expect(mockGt).toHaveBeenCalled();
      const gtArg = mockGt.mock.calls[0][1];
      expect(typeof gtArg).toBe('string'); // ISO timestamp string
    });

    it('should perform full sync when cache is empty', async () => {
      // Clear cache
      const { databaseManager } = await import('@myk9/replication');
      await databaseManager.reset();

      const emptyTable = new ReplicatedShowsTable();

      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await emptyTable.sync(TEST_CLUB_ID);

      // Should use epoch timestamp (full sync)
      expect(mockGt).toHaveBeenCalled();
      const gtArg = mockGt.mock.calls[0][1];
      expect(gtArg).toBe(new Date(0).toISOString());
    });

    it('should sync multiple shows', async () => {
      const remoteShows = [
        {
          id: 'show-1',
          name: 'Show 1',
          organization: 'Obedience',
          start_date: '2024-06-15',
          end_date: '2024-06-16',
          updated_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 'show-2',
          name: 'Show 2',
          organization: 'Agility',
          start_date: '2024-07-15',
          end_date: '2024-07-16',
          updated_at: '2024-01-01T11:00:00Z',
        },
        {
          id: 'show-3',
          name: 'Show 3',
          organization: 'Rally',
          start_date: '2024-08-15',
          end_date: '2024-08-16',
          updated_at: '2024-01-01T12:00:00Z',
        },
      ];

      const mockQueryChain = {
        data: remoteShows,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(3);

      // Verify all shows were cached
      const show1 = await table.get('show-1');
      const show2 = await table.get('show-2');
      const show3 = await table.get('show-3');

      expect(show1?.name).toBe('Show 1');
      expect(show2?.name).toBe('Show 2');
      expect(show3?.name).toBe('Show 3');
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflict with server-wins strategy', async () => {
      const localShow: ReplicatedShow = {
        id: 'show-1',
        name: 'Local Name',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        location: 'Local Location',
        preEntryFee: 30.0,
      };

      const remoteShow: ReplicatedShow = {
        id: 'show-1',
        name: 'Remote Name',
        organization: 'Agility',
        startDate: '2024-06-20',
        endDate: '2024-06-21',
        location: 'Remote Location',
        preEntryFee: 40.0,
      };

      // Access protected method via type assertion
      const resolveConflict = (
        table as unknown as {
          resolveConflict(local: ReplicatedShow, remote: ReplicatedShow): ReplicatedShow;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict(localShow, remoteShow);

      // Server wins - remote show should be returned
      expect(resolved).toBe(remoteShow);
      expect(resolved.name).toBe('Remote Name');
      expect(resolved.organization).toBe('Agility');
      expect(resolved.location).toBe('Remote Location');
      expect(resolved.preEntryFee).toBe(40.0);
    });

    it('should always prefer remote data in conflicts', async () => {
      const local: ReplicatedShow = {
        id: 'show-1',
        name: 'Local Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        maxTotalEntries: 100,
      };

      const remote: ReplicatedShow = {
        id: 'show-1',
        name: 'Remote Show',
        organization: 'Agility',
        startDate: '2024-07-15',
        endDate: '2024-07-16',
        maxTotalEntries: 200,
      };

      const resolveConflict2 = (
        table as unknown as {
          resolveConflict(local: ReplicatedShow, remote: ReplicatedShow): ReplicatedShow;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict2(local, remote);

      expect(resolved).toBe(remote);
      expect(resolved.name).toBe('Remote Show');
      expect(resolved.organization).toBe('Agility');
      expect(resolved.maxTotalEntries).toBe(200);
    });
  });

  describe('Data Transformation', () => {
    it('should transform database row to show with camelCase fields', async () => {
      const remoteShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        start_date: '2024-06-15',
        end_date: '2024-06-16',
        location: 'Test Location',
        status: 'active',
        entry_open_date: '2024-05-01',
        entry_close_date: '2024-06-10',
        pre_entry_fee: 35,
        day_of_show_fee: 45,
        club_id: 'club-123',
        chairman: 'Chairman Name',
        secretary: 'Secretary Name',
        chief_steward: 'Steward Name',
        max_entries_per_dog: 3,
        max_total_entries: 150,
        allow_non_owner_handlers: true,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteShow],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync(TEST_CLUB_ID);

      const show = await table.get('show-1');
      expect(show?.startDate).toBe('2024-06-15');
      expect(show?.endDate).toBe('2024-06-16');
      expect(show?.entryOpenDate).toBe('2024-05-01');
      expect(show?.entryCloseDate).toBe('2024-06-10');
      expect(show?.preEntryFee).toBe(35);
      expect(show?.dayOfShowFee).toBe(45);
      expect(show?.clubId).toBe('club-123');
      expect(show?.chiefSteward).toBe('Steward Name');
      expect(show?.maxEntriesPerDog).toBe(3);
      expect(show?.maxTotalEntries).toBe(150);
      expect(show?.allowsNonOwnerHandlers).toBe(true);
    });

    it('should handle null/undefined fields gracefully', async () => {
      const remoteShow = {
        id: 'show-1',
        name: 'Minimal Show',
        organization: 'Obedience',
        start_date: '2024-06-15',
        end_date: '2024-06-16',
        location: null,
        status: null,
        entry_open_date: null,
        entry_close_date: null,
        pre_entry_fee: null,
        day_of_show_fee: null,
        club_id: null,
        chairman: null,
        secretary: null,
        chief_steward: null,
        max_entries_per_dog: null,
        max_total_entries: null,
        allow_non_owner_handlers: null,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteShow],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync(TEST_CLUB_ID);

      const show = await table.get('show-1');
      expect(show?.name).toBe('Minimal Show');
      expect(show?.organization).toBe('Obedience');
      expect(show?.location).toBeUndefined();
      expect(show?.status).toBeUndefined();
      expect(show?.entryOpenDate).toBeUndefined();
      expect(show?.clubId).toBeUndefined();
      expect(show?.chairman).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const shows: ReplicatedShow[] = [
        {
          id: 'show-1',
          name: 'Show 1',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
        },
        {
          id: 'show-2',
          name: 'Show 2',
          organization: 'Agility',
          startDate: '2024-07-15',
          endDate: '2024-07-16',
        },
        {
          id: 'show-3',
          name: 'Show 3',
          organization: 'Rally',
          startDate: '2024-08-15',
          endDate: '2024-08-16',
        },
      ];

      for (const show of shows) {
        await table.set(show.id, show);
      }

      const stats = await table.getCacheStats();

      expect(stats.rowCount).toBe(3);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      const shows: ReplicatedShow[] = [
        {
          id: 'show-1',
          name: 'Show 1',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
        },
        {
          id: 'show-2',
          name: 'Show 2',
          organization: 'Agility',
          startDate: '2024-07-15',
          endDate: '2024-07-16',
        },
      ];

      for (const show of shows) {
        await table.set(show.id, show);
      }

      await table.clearCache();

      const results = await table.getAll();
      expect(results).toEqual([]);
    });

    it('should track dirty shows after updates', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);
      await table.updateShow('show-1', { name: 'Updated Show' });

      const stats = await table.getCacheStats();
      expect(stats.dirtyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Subscription and Reactivity', () => {
    it('should notify subscribers on data changes', async () => {
      const callback = vi.fn();
      table.subscribe(callback);

      // Wait for initial callback
      await new Promise(resolve => setTimeout(resolve, 50));

      callback.mockClear();

      // Add show
      await table.set('show-1', {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      });

      // Wait for debounced notification
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).toHaveBeenCalled();
    });

    it('should unsubscribe correctly', async () => {
      const callback = vi.fn();
      const unsubscribe = table.subscribe(callback);

      // Wait for initial callback
      await new Promise(resolve => setTimeout(resolve, 50));

      unsubscribe();
      callback.mockClear();

      // Add show after unsubscribe
      await table.set('show-1', {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      });

      // Wait for potential notification
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle shows with all optional fields undefined', async () => {
      const minimalShow: ReplicatedShow = {
        id: 'show-1',
        name: 'Minimal Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', minimalShow);

      const result = await table.get('show-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('show-1');
      expect(result?.location).toBeUndefined();
      expect(result?.status).toBeUndefined();
    });

    it('should handle concurrent updates to same show', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
      };

      await table.set('show-1', show);

      // Perform concurrent updates
      const updates = [
        table.updateShow('show-1', { name: 'Update 1' }),
        table.updateShow('show-1', { name: 'Update 2' }),
        table.updateShow('show-1', { name: 'Update 3' }),
      ];

      await Promise.all(updates);

      const result = await table.get('show-1');
      expect(result?.name).toMatch(/^Update [123]$/); // One of the updates should win
    });

    it('should handle special characters in string fields', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: "Annual Show <2024> & Dog's Day",
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        location: 'Park "North" & Recreation Center',
        chairman: "O'Brien",
      };

      await table.set('show-1', show);

      const result = await table.get('show-1');
      expect(result?.name).toBe("Annual Show <2024> & Dog's Day");
      expect(result?.location).toBe('Park "North" & Recreation Center');
      expect(result?.chairman).toBe("O'Brien");
    });

    it('should handle very large entry limits', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Large Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        maxEntriesPerDog: 999,
        maxTotalEntries: 99999,
      };

      await table.set('show-1', show);

      const result = await table.get('show-1');
      expect(result?.maxEntriesPerDog).toBe(999);
      expect(result?.maxTotalEntries).toBe(99999);
    });

    it('should handle zero and negative fees', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'Free Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        preEntryFee: 0,
        dayOfShowFee: 0,
      };

      await table.set('show-1', show);

      const result = await table.get('show-1');
      expect(result?.preEntryFee).toBe(0);
      expect(result?.dayOfShowFee).toBe(0);
    });

    it('should handle date edge cases (same day show)', async () => {
      const show: ReplicatedShow = {
        id: 'show-1',
        name: 'One Day Show',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-15', // Same as start date
      };

      await table.set('show-1', show);

      const result = await table.get('show-1');
      expect(result?.startDate).toBe('2024-06-15');
      expect(result?.endDate).toBe('2024-06-15');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complete show lifecycle', async () => {
      // 1. Create draft show
      const show = await table.createShow({
        name: 'Annual Show 2024',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        status: 'draft',
        clubId: 'club-123',
      });

      expect(show.status).toBe('draft');

      // 2. Add show details
      await table.updateShow(show.id, {
        location: 'Central Park',
        entryOpenDate: '2024-05-01',
        entryCloseDate: '2024-06-10',
        preEntryFee: 35.0,
        chairman: 'John Smith',
        maxTotalEntries: 150,
      });

      let result = await table.get(show.id);
      expect(result?.location).toBe('Central Park');
      expect(result?.chairman).toBe('John Smith');

      // 3. Activate show
      await table.updateShow(show.id, { status: 'active' });
      result = await table.get(show.id);
      expect(result?.status).toBe('active');

      // 4. Complete show
      await table.updateShow(show.id, { status: 'completed' });
      result = await table.get(show.id);
      expect(result?.status).toBe('completed');

      // 5. Archive show
      await table.updateShow(show.id, { status: 'archived' });
      result = await table.get(show.id);
      expect(result?.status).toBe('archived');
    });

    it('should handle batch show creation', async () => {
      // Create multiple shows
      const showData = Array.from({ length: 5 }, (_, i) => ({
        name: `Show ${i + 1}`,
        organization: 'Obedience',
        startDate: `2024-0${i + 6}-15`,
        endDate: `2024-0${i + 6}-16`,
        clubId: 'club-123',
      }));

      const createdShows = await Promise.all(showData.map(data => table.createShow(data)));

      expect(createdShows).toHaveLength(5);

      // Verify all shows were created
      const allShows = await table.getAllShows();
      expect(allShows.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle filtering shows by multiple criteria', async () => {
      const shows: ReplicatedShow[] = [
        {
          id: 'show-1',
          name: 'Show 1',
          organization: 'Obedience',
          startDate: '2024-06-15',
          endDate: '2024-06-16',
          status: 'active',
          clubId: 'club-123',
        },
        {
          id: 'show-2',
          name: 'Show 2',
          organization: 'Agility',
          startDate: '2026-07-15',
          endDate: '2026-07-16',
          status: 'draft',
          clubId: 'club-123',
        },
        {
          id: 'show-3',
          name: 'Show 3',
          organization: 'Rally',
          startDate: '2026-08-15',
          endDate: '2026-08-16',
          status: 'active',
          clubId: 'club-456',
        },
      ];

      for (const show of shows) {
        await table.set(show.id, show);
      }

      // Get all shows
      const allShows = await table.getAllShows();
      expect(allShows.length).toBeGreaterThanOrEqual(3);

      // Get club-123 shows
      const club123Shows = await table.getShowsByClub('club-123');
      expect(club123Shows).toHaveLength(2);

      // Get upcoming shows
      const upcomingShows = await table.getUpcomingShows();
      expect(upcomingShows.length).toBeGreaterThan(0);

      // Manual filtering: active shows only
      const activeShows = allShows.filter(show => show.status === 'active');
      expect(activeShows.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle show updates during sync conflict', async () => {
      // Setup local show with local changes
      const localShow: ReplicatedShow = {
        id: 'show-1',
        name: 'Local Show Name',
        organization: 'Obedience',
        startDate: '2024-06-15',
        endDate: '2024-06-16',
        location: 'Local Location',
        _syncStatus: 'pending',
      };

      await table.set('show-1', localShow);

      // Simulate remote sync with server data
      const remoteShow = {
        id: 'show-1',
        name: 'Server Show Name',
        organization: 'Agility',
        start_date: '2024-06-20',
        end_date: '2024-06-21',
        location: 'Server Location',
        updated_at: new Date(Date.now() + 1000).toISOString(),
      };

      const mockQueryChain = {
        data: [remoteShow],
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      const { supabase } = await import('@/services/database/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_CLUB_ID);

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      // Server wins
      const show = await table.get('show-1');
      expect(show?.name).toBe('Server Show Name');
      expect(show?.organization).toBe('Agility');
      expect(show?.location).toBe('Server Location');
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', async () => {
      const { replicatedShowsTable } = await import('../ReplicatedShowsTable');

      expect(replicatedShowsTable).toBeInstanceOf(ReplicatedShowsTable);
      expect(replicatedShowsTable.getTableName()).toBe('shows');
    });
  });
});
