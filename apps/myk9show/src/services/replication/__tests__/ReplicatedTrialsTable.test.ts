/**
 * ReplicatedTrialsTable Tests
 *
 * Validates offline-first trial data replication for myK9Show:
 * - Trial CRUD operations (create, read, update, delete)
 * - Trial filtering (by show, by date, by type)
 * - Trial type handling (obedience, rally, scent work, etc.)
 * - Cache management and invalidation
 * - Sync operations with conflict resolution
 * - Offline-first mutations and queue management
 * - Trial scheduling and timing
 * - Error handling and validation
 * - Trial relationship with classes (trials contain multiple classes)
 * - Data transformation (snake_case to camelCase)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedTrialsTable, type ReplicatedTrial } from '../ReplicatedTrialsTable';

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

const TEST_SHOW_ID = 'show-123';

describe('ReplicatedTrialsTable', () => {
  let table: ReplicatedTrialsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();

    table = new ReplicatedTrialsTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  describe('Constructor Initialization', () => {
    it('should initialize with table name "trials"', () => {
      expect(table.getTableName()).toBe('trials');
    });

    it('should be an instance of ReplicatedTrialsTable', () => {
      expect(table).toBeInstanceOf(ReplicatedTrialsTable);
    });
  });

  describe('Trial CRUD Operations', () => {
    describe('set and get', () => {
      it('should store and retrieve a trial', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          trialNumber: '2024-001',
          status: 'scheduled',
        };

        await table.set('trial-1', trial);

        const result = await table.get('trial-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('trial-1');
        expect(result?.name).toBe('Saturday Morning');
        expect(result?.date).toBe('2024-06-15');
      });

      it('should return null for non-existent trial', async () => {
        const result = await table.get('nonexistent-trial');
        expect(result).toBeNull();
      });

      it('should update existing trial', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          status: 'scheduled',
        };

        await table.set('trial-1', trial);
        await table.set('trial-1', { ...trial, status: 'in_progress' });

        const result = await table.get('trial-1');
        expect(result?.status).toBe('in_progress');
      });

      it('should handle trials with entry limits', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          maxEntriesPerDog: 5,
          maxTotalEntries: 200,
          maxEntriesPerHandler: 10,
        };

        await table.set('trial-1', trial);

        const result = await table.get('trial-1');
        expect(result?.maxEntriesPerDog).toBe(5);
        expect(result?.maxTotalEntries).toBe(200);
        expect(result?.maxEntriesPerHandler).toBe(10);
      });

      it('should handle trials with trial_date and trial_number fields', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          showId: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          trialNumber: '2024-001',
          trial_date: '2024-06-15',
          trial_number: '2024-001',
        };

        await table.set('trial-1', trial);

        const result = await table.get('trial-1');
        expect(result?.trial_date).toBe('2024-06-15');
        expect(result?.trial_number).toBe('2024-001');
      });

      it('should handle trials with minimal required fields', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          name: 'Minimal Trial',
          date: '2024-06-15',
        };

        await table.set('trial-1', trial);

        const result = await table.get('trial-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('trial-1');
        expect(result?.name).toBe('Minimal Trial');
      });
    });

    describe('getAll', () => {
      it('should return empty array when no trials exist', async () => {
        const results = await table.getAll();
        expect(results).toEqual([]);
      });

      it('should return all trials', async () => {
        const trials: ReplicatedTrial[] = [
          { id: 'trial-1', name: 'Saturday AM', date: '2024-06-15', showId: 'show-1' },
          { id: 'trial-2', name: 'Saturday PM', date: '2024-06-15', showId: 'show-1' },
          { id: 'trial-3', name: 'Sunday AM', date: '2024-06-16', showId: 'show-1' },
        ];

        for (const trial of trials) {
          await table.set(trial.id, trial);
        }

        const results = await table.getAll();
        expect(results).toHaveLength(3);
      });
    });

    describe('delete', () => {
      it('should remove a trial from cache', async () => {
        const trial: ReplicatedTrial = {
          id: 'trial-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
        };

        await table.set('trial-1', trial);
        await table.delete('trial-1');

        const result = await table.get('trial-1');
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent trial', async () => {
        await expect(table.delete('nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Trial Filtering and Query Operations', () => {
    beforeEach(async () => {
      // Setup test data for filtering tests
      const trials: ReplicatedTrial[] = [
        {
          id: 'trial-1',
          name: 'Saturday AM',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-001',
        },
        {
          id: 'trial-2',
          name: 'Saturday PM',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-002',
        },
        {
          id: 'trial-3',
          name: 'Sunday AM',
          date: '2024-06-16',
          showId: 'show-1',
          trialNumber: '2024-003',
        },
        {
          id: 'trial-4',
          name: 'Friday Morning',
          date: '2024-06-14',
          showId: 'show-2',
          trialNumber: '2024-004',
        },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }
    });

    describe('getTrialsByShow', () => {
      it('should return trials for specific show sorted by date', async () => {
        const results = await table.getTrialsByShow('show-1');

        expect(results).toHaveLength(3);
        expect(results.every(t => t.showId === 'show-1')).toBe(true);

        // Verify sorting by date
        expect(results[0]?.date).toBe('2024-06-15');
        expect(results[1]?.date).toBe('2024-06-15');
        expect(results[2]?.date).toBe('2024-06-16');
      });

      it('should return empty array for non-existent show', async () => {
        const results = await table.getTrialsByShow('show-999');
        expect(results).toEqual([]);
      });

      it('should filter correctly across multiple shows', async () => {
        const show1Results = await table.getTrialsByShow('show-1');
        const show2Results = await table.getTrialsByShow('show-2');

        expect(show1Results).toHaveLength(3);
        expect(show2Results).toHaveLength(1);
        expect(show2Results[0]?.name).toBe('Friday Morning');
      });

      it('should sort trials chronologically within a show', async () => {
        const results = await table.getTrialsByShow('show-1');

        // First trials should be from earlier date
        expect(new Date(results[0]?.date || '').getTime()).toBeLessThanOrEqual(
          new Date(results[results.length - 1]?.date || '').getTime()
        );
      });
    });

    describe('getTrialsByDate', () => {
      it('should return trials for specific date', async () => {
        const results = await table.getTrialsByDate('2024-06-15');

        expect(results).toHaveLength(2);
        expect(results.every(t => t.date === '2024-06-15')).toBe(true);
        expect(results.map(t => t.name).sort()).toEqual(['Saturday AM', 'Saturday PM']);
      });

      it('should return empty array for date with no trials', async () => {
        const results = await table.getTrialsByDate('2024-12-25');
        expect(results).toEqual([]);
      });

      it('should handle date format consistently', async () => {
        const results = await table.getTrialsByDate('2024-06-16');

        expect(results).toHaveLength(1);
        expect(results[0]?.name).toBe('Sunday AM');
      });
    });

    describe('getTrialById', () => {
      it('should return trial by ID', async () => {
        const result = await table.getTrialById('trial-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('trial-1');
        expect(result?.name).toBe('Saturday AM');
      });

      it('should return null for non-existent ID', async () => {
        const result = await table.getTrialById('nonexistent');
        expect(result).toBeNull();
      });

      it('should be an alias for get method', async () => {
        const byId = await table.getTrialById('trial-1');
        const byGet = await table.get('trial-1');

        expect(byId).toEqual(byGet);
      });
    });
  });

  describe('Trial Scheduling and Timing', () => {
    it('should handle trial date ordering', async () => {
      const trials: ReplicatedTrial[] = [
        { id: 'trial-1', name: 'Day 3', date: '2024-06-17', showId: 'show-1' },
        { id: 'trial-2', name: 'Day 1', date: '2024-06-15', showId: 'show-1' },
        { id: 'trial-3', name: 'Day 2', date: '2024-06-16', showId: 'show-1' },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      const results = await table.getTrialsByShow('show-1');

      expect(results[0]?.name).toBe('Day 1');
      expect(results[1]?.name).toBe('Day 2');
      expect(results[2]?.name).toBe('Day 3');
    });

    it('should handle multiple trials on same date', async () => {
      const trials: ReplicatedTrial[] = [
        {
          id: 'trial-1',
          name: 'Morning Session',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-001',
        },
        {
          id: 'trial-2',
          name: 'Afternoon Session',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-002',
        },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      const results = await table.getTrialsByDate('2024-06-15');
      expect(results).toHaveLength(2);
    });

    it('should track trial status lifecycle', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        status: 'scheduled',
        showId: 'show-1',
      };

      await table.set('trial-1', trial);

      // Status: scheduled -> in_progress
      await table.set('trial-1', { ...trial, status: 'in_progress' });
      let result = await table.get('trial-1');
      expect(result?.status).toBe('in_progress');

      // Status: in_progress -> completed
      await table.set('trial-1', { ...trial, status: 'completed' });
      result = await table.get('trial-1');
      expect(result?.status).toBe('completed');
    });
  });

  describe('Trial Entry Limits', () => {
    it('should handle maxEntriesPerDog limit', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        maxEntriesPerDog: 4,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxEntriesPerDog).toBe(4);
    });

    it('should handle maxTotalEntries limit', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        maxTotalEntries: 150,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxTotalEntries).toBe(150);
    });

    it('should handle maxEntriesPerHandler limit', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        maxEntriesPerHandler: 8,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxEntriesPerHandler).toBe(8);
    });

    it('should handle all entry limits together', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        maxEntriesPerDog: 5,
        maxTotalEntries: 200,
        maxEntriesPerHandler: 10,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxEntriesPerDog).toBe(5);
      expect(result?.maxTotalEntries).toBe(200);
      expect(result?.maxEntriesPerHandler).toBe(10);
    });

    it('should handle undefined entry limits', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Unlimited Trial',
        date: '2024-06-15',
        maxEntriesPerDog: undefined,
        maxTotalEntries: undefined,
        maxEntriesPerHandler: undefined,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxEntriesPerDog).toBeUndefined();
      expect(result?.maxTotalEntries).toBeUndefined();
      expect(result?.maxEntriesPerHandler).toBeUndefined();
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

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('trials');
      expect(result.rowsAffected).toBe(0);
      expect(result.operation).toBe('full-sync');
    });

    it('should sync new trials from remote', async () => {
      // Mock remote trials
      const remoteTrials = [
        {
          id: 'trial-1',
          show_id: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          trial_number: '2024-001',
          status: 'scheduled',
          max_entries_per_dog: 5,
          max_total_entries: 200,
          max_entries_per_handler: 10,
          updated_at: '2024-01-01T10:00:00Z',
        },
      ];

      const mockQueryChain = {
        data: remoteTrials,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
      expect(result.operation).toBe('full-sync');

      // Verify trial was cached
      const trial = await table.get('trial-1');
      expect(trial).not.toBeNull();
      expect(trial?.showId).toBe('show-1');
      expect(trial?.name).toBe('Saturday Morning');
      expect(trial?.maxEntriesPerDog).toBe(5);
    });

    it('should resolve conflicts during sync', async () => {
      // Setup local trial
      const localTrial: ReplicatedTrial = {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Old Name',
        date: '2024-06-15',
        status: 'scheduled',
      };
      await table.set('trial-1', localTrial);

      // Mock remote trial with different data
      const remoteTrials = [
        {
          id: 'trial-1',
          show_id: 'show-1',
          name: 'Updated Name',
          date: '2024-06-15',
          status: 'in_progress',
          updated_at: new Date(Date.now() + 1000).toISOString(),
        },
      ];

      const mockQueryChain = {
        data: remoteTrials,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      // Server wins - remote data should be in cache
      const trial = await table.get('trial-1');
      expect(trial?.name).toBe('Updated Name');
      expect(trial?.status).toBe('in_progress');
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

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should filter by show_id during sync', async () => {
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

      await table.sync(TEST_SHOW_ID);

      // Verify query construction
      expect(supabaseMock.from).toHaveBeenCalledWith('trials');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('show_id', TEST_SHOW_ID);
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
      await table.sync(TEST_SHOW_ID);
      const afterSync = Date.now();

      const metadata = await table.getSyncMetadata();
      // Full sync stamps lastFullSyncAt with the client clock; the incremental
      // watermark is server-derived and stays 0 on an empty fetch.
      expect(metadata?.lastFullSyncAt).toBeGreaterThanOrEqual(beforeSync);
      expect(metadata?.lastFullSyncAt).toBeLessThanOrEqual(afterSync);
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

      await table.sync(TEST_SHOW_ID);

      // Verify gt was called with a timestamp (incremental sync)
      expect(mockGt).toHaveBeenCalled();
      const gtArg = mockGt.mock.calls[0][1];
      expect(typeof gtArg).toBe('string'); // ISO timestamp string
    });

    it('should sync multiple trials in one batch', async () => {
      const remoteTrials = [
        {
          id: 'trial-1',
          show_id: 'show-1',
          name: 'Saturday Morning',
          date: '2024-06-15',
          trial_number: '2024-001',
          updated_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 'trial-2',
          show_id: 'show-1',
          name: 'Saturday Afternoon',
          date: '2024-06-15',
          trial_number: '2024-002',
          updated_at: '2024-01-01T11:00:00Z',
        },
        {
          id: 'trial-3',
          show_id: 'show-1',
          name: 'Sunday Morning',
          date: '2024-06-16',
          trial_number: '2024-003',
          updated_at: '2024-01-01T12:00:00Z',
        },
      ];

      const mockQueryChain = {
        data: remoteTrials,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(3);

      // Verify all trials were cached
      const trial1 = await table.get('trial-1');
      const trial2 = await table.get('trial-2');
      const trial3 = await table.get('trial-3');

      expect(trial1?.name).toBe('Saturday Morning');
      expect(trial2?.name).toBe('Saturday Afternoon');
      expect(trial3?.name).toBe('Sunday Morning');
    });

    it('should sync without show filter when license key is empty', async () => {
      const mockQueryChain = {
        data: [],
        error: null,
      };

      const mockOrder = vi.fn().mockResolvedValue(mockQueryChain);
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      await table.sync('');

      // Verify no eq filter was applied
      expect(mockOrder).toHaveBeenCalled();
      const orderReturnValue = mockOrder.mock.results[0].value;
      expect(orderReturnValue).not.toHaveProperty('eq');
    });
  });

  describe('Conflict Resolution', () => {
    it('should resolve conflict with server-wins strategy', async () => {
      const localTrial: ReplicatedTrial = {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Local Name',
        date: '2024-06-15',
        status: 'scheduled',
        maxEntriesPerDog: 3,
      };

      const remoteTrial: ReplicatedTrial = {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Remote Name',
        date: '2024-06-15',
        status: 'in_progress',
        maxEntriesPerDog: 5,
      };

      // Access protected method via type assertion
      const resolveConflict = (
        table as unknown as {
          resolveConflict(local: ReplicatedTrial, remote: ReplicatedTrial): ReplicatedTrial;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict(localTrial, remoteTrial);

      // Server wins - remote trial should be returned
      expect(resolved).toBe(remoteTrial);
      expect(resolved.name).toBe('Remote Name');
      expect(resolved.status).toBe('in_progress');
      expect(resolved.maxEntriesPerDog).toBe(5);
    });

    it('should always prefer remote data in conflicts', async () => {
      const local: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Local',
        date: '2024-06-15',
        maxTotalEntries: 100,
      };

      const remote: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Remote',
        date: '2024-06-15',
        maxTotalEntries: 200,
      };

      const resolveConflict2 = (
        table as unknown as {
          resolveConflict(local: ReplicatedTrial, remote: ReplicatedTrial): ReplicatedTrial;
        }
      ).resolveConflict.bind(table);
      const resolved = resolveConflict2(local, remote);

      expect(resolved).toBe(remote);
      expect(resolved.name).toBe('Remote');
      expect(resolved.maxTotalEntries).toBe(200);
    });
  });

  describe('Data Transformation', () => {
    it('should transform database row to trial with camelCase fields', async () => {
      const remoteTrial = {
        id: 'trial-1',
        show_id: 'show-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        trial_number: '2024-001',
        status: 'scheduled',
        max_entries_per_dog: 5,
        max_total_entries: 200,
        max_entries_per_handler: 10,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteTrial],
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

      await table.sync(TEST_SHOW_ID);

      const trial = await table.get('trial-1');
      expect(trial?.showId).toBe('show-1');
      expect(trial?.trialNumber).toBe('2024-001');
      expect(trial?.maxEntriesPerDog).toBe(5);
      expect(trial?.maxTotalEntries).toBe(200);
      expect(trial?.maxEntriesPerHandler).toBe(10);
    });

    it('should map trial_date and trial_number fields', async () => {
      const remoteTrial = {
        id: 'trial-1',
        show_id: 'show-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        trial_number: '2024-001',
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteTrial],
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

      await table.sync(TEST_SHOW_ID);

      const trial = await table.get('trial-1');
      expect(trial?.trial_date).toBe('2024-06-15');
      expect(trial?.trial_number).toBe('2024-001');
    });

    it('should handle null/undefined fields gracefully', async () => {
      const remoteTrial = {
        id: 'trial-1',
        show_id: null,
        name: 'Test Trial',
        date: '2024-06-15',
        trial_number: null,
        status: null,
        max_entries_per_dog: null,
        max_total_entries: null,
        max_entries_per_handler: null,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteTrial],
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

      await table.sync(TEST_SHOW_ID);

      const trial = await table.get('trial-1');
      expect(trial?.showId).toBeUndefined();
      expect(trial?.trialNumber).toBeUndefined();
      expect(trial?.status).toBeUndefined();
      expect(trial?.maxEntriesPerDog).toBeUndefined();
      expect(trial?.maxTotalEntries).toBeUndefined();
      expect(trial?.maxEntriesPerHandler).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const trials: ReplicatedTrial[] = [
        { id: 'trial-1', name: 'Trial 1', date: '2024-06-15', showId: 'show-1' },
        { id: 'trial-2', name: 'Trial 2', date: '2024-06-16', showId: 'show-1' },
        { id: 'trial-3', name: 'Trial 3', date: '2024-06-17', showId: 'show-1' },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      const stats = await table.getCacheStats();

      expect(stats.rowCount).toBe(3);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      const trials: ReplicatedTrial[] = [
        { id: 'trial-1', name: 'Trial 1', date: '2024-06-15', showId: 'show-1' },
        { id: 'trial-2', name: 'Trial 2', date: '2024-06-16', showId: 'show-1' },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      await table.clearCache();

      const results = await table.getAll();
      expect(results).toEqual([]);
    });

    it('should track dirty trials after updates', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Original Name',
        date: '2024-06-15',
        showId: 'show-1',
      };

      await table.set('trial-1', trial);

      // Mark as dirty
      await table.set('trial-1', { ...trial, name: 'Updated Name' }, true);

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

      // Add trial
      await table.set('trial-1', { id: 'trial-1', name: 'New Trial', date: '2024-06-15' });

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

      // Add trial after unsubscribe
      await table.set('trial-1', { id: 'trial-1', name: 'New Trial', date: '2024-06-15' });

      // Wait for potential notification
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle trials with all optional fields undefined', async () => {
      const minimalTrial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Minimal',
        date: '2024-06-15',
      };

      await table.set('trial-1', minimalTrial);

      const result = await table.get('trial-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('trial-1');
    });

    it('should handle concurrent updates to same trial', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Original',
        date: '2024-06-15',
        showId: 'show-1',
      };

      await table.set('trial-1', trial);

      // Perform concurrent updates
      const updates = [
        table.set('trial-1', { ...trial, name: 'Update 1' }),
        table.set('trial-1', { ...trial, name: 'Update 2' }),
        table.set('trial-1', { ...trial, name: 'Update 3' }),
      ];

      await Promise.all(updates);

      const result = await table.get('trial-1');
      expect(result?.name).toMatch(/^Update [123]$/); // One of the updates should win
    });

    it('should handle empty string IDs', async () => {
      const trial: ReplicatedTrial = {
        id: '',
        name: 'Empty ID Trial',
        date: '2024-06-15',
      };

      await table.set('', trial);

      const result = await table.get('');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('');
    });

    it('should handle special characters in string fields', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: "Trial's Name <script>",
        date: '2024-06-15',
        trialNumber: '2024-001 & 002',
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.name).toBe("Trial's Name <script>");
      expect(result?.trialNumber).toBe('2024-001 & 002');
    });

    it('should handle very large entry limits', async () => {
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        name: 'Large Trial',
        date: '2024-06-15',
        maxEntriesPerDog: 999999,
        maxTotalEntries: 999999,
        maxEntriesPerHandler: 999999,
      };

      await table.set('trial-1', trial);

      const result = await table.get('trial-1');
      expect(result?.maxEntriesPerDog).toBe(999999);
      expect(result?.maxTotalEntries).toBe(999999);
      expect(result?.maxEntriesPerHandler).toBe(999999);
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complete trial lifecycle', async () => {
      // 1. Trial is scheduled
      const trial: ReplicatedTrial = {
        id: 'trial-1',
        showId: 'show-1',
        name: 'Saturday Morning',
        date: '2024-06-15',
        status: 'scheduled',
        trialNumber: '2024-001',
        maxTotalEntries: 150,
      };

      await table.set('trial-1', trial);

      // 2. Trial starts
      await table.set('trial-1', { ...trial, status: 'in_progress' });
      let result = await table.get('trial-1');
      expect(result?.status).toBe('in_progress');

      // 3. Trial completes
      await table.set('trial-1', { ...trial, status: 'completed' });
      result = await table.get('trial-1');
      expect(result?.status).toBe('completed');
    });

    it('should handle multi-day show with multiple trials', async () => {
      // Create trials for a 3-day show
      const trials: ReplicatedTrial[] = [
        {
          id: 'trial-1',
          name: 'Friday AM',
          date: '2024-06-14',
          showId: 'show-1',
          trialNumber: '2024-001',
        },
        {
          id: 'trial-2',
          name: 'Friday PM',
          date: '2024-06-14',
          showId: 'show-1',
          trialNumber: '2024-002',
        },
        {
          id: 'trial-3',
          name: 'Saturday AM',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-003',
        },
        {
          id: 'trial-4',
          name: 'Saturday PM',
          date: '2024-06-15',
          showId: 'show-1',
          trialNumber: '2024-004',
        },
        {
          id: 'trial-5',
          name: 'Sunday AM',
          date: '2024-06-16',
          showId: 'show-1',
          trialNumber: '2024-005',
        },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      // Verify all trials are stored
      const allTrials = await table.getTrialsByShow('show-1');
      expect(allTrials).toHaveLength(5);

      // Verify date filtering
      const fridayTrials = await table.getTrialsByDate('2024-06-14');
      const saturdayTrials = await table.getTrialsByDate('2024-06-15');
      const sundayTrials = await table.getTrialsByDate('2024-06-16');

      expect(fridayTrials).toHaveLength(2);
      expect(saturdayTrials).toHaveLength(2);
      expect(sundayTrials).toHaveLength(1);
    });

    it('should handle filtering trials across multiple shows', async () => {
      const trials: ReplicatedTrial[] = [
        { id: 'trial-1', name: 'Show 1 - Day 1', date: '2024-06-15', showId: 'show-1' },
        { id: 'trial-2', name: 'Show 1 - Day 2', date: '2024-06-16', showId: 'show-1' },
        { id: 'trial-3', name: 'Show 2 - Day 1', date: '2024-07-20', showId: 'show-2' },
        { id: 'trial-4', name: 'Show 2 - Day 2', date: '2024-07-21', showId: 'show-2' },
        { id: 'trial-5', name: 'Show 3 - Day 1', date: '2024-08-10', showId: 'show-3' },
      ];

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      // Get trials for each show
      const show1Trials = await table.getTrialsByShow('show-1');
      const show2Trials = await table.getTrialsByShow('show-2');
      const show3Trials = await table.getTrialsByShow('show-3');

      expect(show1Trials).toHaveLength(2);
      expect(show2Trials).toHaveLength(2);
      expect(show3Trials).toHaveLength(1);

      // Verify show separation
      expect(show1Trials.every(t => t.showId === 'show-1')).toBe(true);
      expect(show2Trials.every(t => t.showId === 'show-2')).toBe(true);
      expect(show3Trials.every(t => t.showId === 'show-3')).toBe(true);
    });

    it('should handle batch trial updates', async () => {
      // Create multiple trials
      const trials: ReplicatedTrial[] = Array.from({ length: 10 }, (_, i) => ({
        id: `trial-${i + 1}`,
        name: `Trial ${i + 1}`,
        date: '2024-06-15',
        showId: 'show-1',
        status: 'scheduled',
      }));

      for (const trial of trials) {
        await table.set(trial.id, trial);
      }

      // Bulk update all trials to in_progress
      for (const trial of trials) {
        await table.set(trial.id, { ...trial, status: 'in_progress' });
      }

      // Verify all updated
      const results = await table.getTrialsByShow('show-1');
      expect(results).toHaveLength(10);
      expect(results.every(t => t.status === 'in_progress')).toBe(true);
    });
  });

  describe('Sync Metadata Management', () => {
    it('should track last sync timestamp', async () => {
      const mockQueryChain = {
        data: [],
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

      const beforeSync = Date.now();
      await table.sync(TEST_SHOW_ID);
      const afterSync = Date.now();

      const metadata = await table.getSyncMetadata();
      // Full sync stamps lastFullSyncAt with the client clock (the tracked sync
      // timestamp); the incremental watermark is server-derived and stays 0 on an
      // empty fetch.
      expect(metadata?.lastFullSyncAt).toBeDefined();
      expect(metadata?.lastFullSyncAt).toBeGreaterThanOrEqual(beforeSync);
      expect(metadata?.lastFullSyncAt).toBeLessThanOrEqual(afterSync);
    });

    it('should track sync status', async () => {
      const mockQueryChain = {
        data: [],
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

      await table.sync(TEST_SHOW_ID);

      const metadata = await table.getSyncMetadata();
      expect(metadata?.syncStatus).toBe('idle');
    });
  });

  describe('Performance and Sync Result Metrics', () => {
    it('should measure sync duration', async () => {
      const mockQueryChain = {
        data: [],
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

      const result = await table.sync(TEST_SHOW_ID);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should include all sync result fields', async () => {
      const mockQueryChain = {
        data: [],
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

      const result = await table.sync(TEST_SHOW_ID);

      expect(result).toHaveProperty('tableName');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('operation');
      expect(result).toHaveProperty('rowsAffected');
      expect(result).toHaveProperty('conflictsResolved');
      expect(result).toHaveProperty('duration');
    });
  });

  describe('Singleton Export', () => {
    it('should export singleton instance', async () => {
      const { replicatedTrialsTable } = await import('../ReplicatedTrialsTable');

      expect(replicatedTrialsTable).toBeInstanceOf(ReplicatedTrialsTable);
      expect(replicatedTrialsTable.getTableName()).toBe('trials');
    });
  });
});
