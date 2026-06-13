/**
 * ReplicatedEntriesTable Tests
 *
 * Validates offline-first entry data replication for myK9Show:
 * - Entry CRUD operations (create, read, update, delete)
 * - Entry status transitions (registered, checked-in, scoring, completed)
 * - Cache management and invalidation
 * - Sync operations with conflict resolution
 * - Entry filtering and search operations (by class, show, armband)
 * - Data transformation (rowToEntry conversion)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ReplicatedEntriesTable,
  rowToEntry,
  type ReplicatedEntry,
} from '../ReplicatedEntriesTable';

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

const TEST_LICENSE_KEY = 'show-123';

describe('ReplicatedEntriesTable', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();

    table = new ReplicatedEntriesTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  describe('Constructor Initialization', () => {
    it('should initialize with table name "entries"', () => {
      expect(table.getTableName()).toBe('entries');
    });

    it('should be an instance of ReplicatedEntriesTable', () => {
      expect(table).toBeInstanceOf(ReplicatedEntriesTable);
    });
  });

  describe('rowToEntry', () => {
    it('maps deleted_at so day-of capacity filters can exclude soft-deleted entries', () => {
      const deletedAt = '2026-06-05T12:00:00.000Z';

      const entry = rowToEntry({
        id: 'entry-deleted',
        class_id: 'class-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        armband: '101',
        handler: 'Jamie Walker',
        entry_status: 'confirmed',
        check_in_status: 'checked-in',
        deleted_at: deletedAt,
        updated_at: '2026-06-05T12:01:00.000Z',
      } as Parameters<typeof rowToEntry>[0]);

      expect(entry.deletedAt).toBe(deletedAt);
      expect(entry.deleted_at).toBe(deletedAt);
    });
  });

  describe('Entry CRUD Operations', () => {
    describe('set and get', () => {
      it('should store and retrieve an entry', async () => {
        const entry: ReplicatedEntry = {
          id: 'entry-1',
          classId: 'class-1',
          showId: 'show-1',
          dogId: 'dog-1',
          handlerId: 'handler-1',
          armband: '101',
          status: 'registered',
          entryStatus: 'pending',
        };

        await table.set('entry-1', entry);

        const result = await table.get('entry-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('entry-1');
        expect(result?.armband).toBe('101');
        expect(result?.status).toBe('registered');
      });

      it('should return null for non-existent entry', async () => {
        const result = await table.get('nonexistent-entry');
        expect(result).toBeNull();
      });

      it('should default entry source to myK9 when queueing a new entry', async () => {
        const queueMutation = vi.spyOn(
          table as unknown as {
            queueMutation: (
              operation: string,
              rowId: string,
              payload: Record<string, unknown>,
              dependencies?: string[]
            ) => Promise<string | null>;
          },
          'queueMutation'
        );

        await table.createEntry({
          id: 'entry-1',
          classId: 'class-1',
          showId: 'show-1',
          dogId: 'dog-1',
        });

        expect(queueMutation).toHaveBeenCalledWith(
          'INSERT',
          'entry-1',
          expect.objectContaining({
            entry_source: 'myk9',
          }),
          undefined
        );
      });

      it('should update existing entry', async () => {
        const entry: ReplicatedEntry = {
          id: 'entry-1',
          classId: 'class-1',
          armband: '101',
          status: 'registered',
        };

        await table.set('entry-1', entry);
        await table.set('entry-1', { ...entry, status: 'checked-in' });

        const result = await table.get('entry-1');
        expect(result?.status).toBe('checked-in');
      });

      it('should handle entries with scoring data', async () => {
        const entry: ReplicatedEntry = {
          id: 'entry-1',
          classId: 'class-1',
          armband: '101',
          isScored: true,
          is_scored: true,
          resultStatus: 'Q',
          result_status: 'Q',
          searchTimeSeconds: 120.5,
          search_time_seconds: 120.5,
          totalPoints: 95,
          total_points: 95,
          finalPlacement: '1',
          final_placement: '1',
        };

        await table.set('entry-1', entry);

        const result = await table.get('entry-1');
        expect(result?.isScored).toBe(true);
        expect(result?.resultStatus).toBe('Q');
        expect(result?.searchTimeSeconds).toBe(120.5);
        expect(result?.totalPoints).toBe(95);
        expect(result?.finalPlacement).toBe('1');
      });

      it('should handle entries with dog and handler info', async () => {
        const entry: ReplicatedEntry = {
          id: 'entry-1',
          classId: 'class-1',
          armband: '101',
          dogCallName: 'Rex',
          dog_call_name: 'Rex',
          dogBreed: 'German Shepherd',
          dog_breed: 'German Shepherd',
          handlerName: 'John Doe',
          handler_name: 'John Doe',
        };

        await table.set('entry-1', entry);

        const result = await table.get('entry-1');
        expect(result?.dogCallName).toBe('Rex');
        expect(result?.dogBreed).toBe('German Shepherd');
        expect(result?.handlerName).toBe('John Doe');
      });
    });

    describe('getAll', () => {
      it('should return empty array when no entries exist', async () => {
        const results = await table.getAll();
        expect(results).toEqual([]);
      });

      it('should return all entries', async () => {
        const entries: ReplicatedEntry[] = [
          { id: 'entry-1', classId: 'class-1', armband: '101' },
          { id: 'entry-2', classId: 'class-1', armband: '102' },
          { id: 'entry-3', classId: 'class-2', armband: '201' },
        ];

        for (const entry of entries) {
          await table.set(entry.id, entry);
        }

        const results = await table.getAll();
        expect(results).toHaveLength(3);
      });
    });

    describe('delete', () => {
      it('should remove an entry from cache', async () => {
        const entry: ReplicatedEntry = {
          id: 'entry-1',
          classId: 'class-1',
          armband: '101',
        };

        await table.set('entry-1', entry);
        await table.delete('entry-1');

        const result = await table.get('entry-1');
        expect(result).toBeNull();
      });

      it('should not throw when deleting non-existent entry', async () => {
        await expect(table.delete('nonexistent')).resolves.not.toThrow();
      });
    });
  });

  describe('Entry Status Management', () => {
    it('should update entry status', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'registered',
      };

      await table.set('entry-1', entry);
      await table.updateEntryStatus('entry-1', 'checked-in');

      const result = await table.get('entry-1');
      expect(result?.status).toBe('checked-in');
    });

    it('should mark entry as dirty when updating status', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'registered',
      };

      await table.set('entry-1', entry);
      await table.updateEntryStatus('entry-1', 'checked-in');

      const result = await table.get('entry-1');
      expect(result?._syncStatus).toBe('pending');
    });

    it('should queue only check_in_status for narrow check-in status updates', async () => {
      const queueMutation = vi.spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependencies?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      );

      await table.set('entry-1', {
        id: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handler: 'Jane Handler',
        armband: '101',
        resultStatus: 'qualified',
      });

      await table.updateCheckInStatus('entry-1', 'checked-in');

      const payload = queueMutation.mock.calls[0]?.[2];
      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'entry-1',
        expect.objectContaining({
          id: 'entry-1',
          check_in_status: 'checked-in',
          updated_at: expect.any(String),
        })
      );
      expect(payload).not.toHaveProperty('result_status');
      expect(payload).not.toHaveProperty('handler');
      expect(payload).not.toHaveProperty('class_id');

      const result = await table.get('entry-1');
      expect(result?.checkInStatus).toBe('checked-in');
      expect(result?.check_in_status).toBe('checked-in');
      expect(result?._syncStatus).toBe('pending');
    });

    it('should seed missing secretary rows and queue only lifecycle status fields', async () => {
      const queueMutation = vi.spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependencies?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      );

      await table.updateSecretaryLifecycleStatus(
        'entry-1',
        {
          entryStatus: 'scratched',
          entry_status: 'scratched',
          status: 'scratched',
          checkInStatus: 'pulled',
          check_in_status: 'pulled',
          withdrawalReason: 'Dog absent',
          withdrawal_reason: 'Dog absent',
        },
        {
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          armband: '101',
          paymentStatus: 'paid',
        }
      );

      const payload = queueMutation.mock.calls[0]?.[2];
      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'entry-1',
        expect.objectContaining({
          id: 'entry-1',
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason: 'Dog absent',
          updated_at: expect.any(String),
        })
      );
      expect(payload).not.toHaveProperty('show_id');
      expect(payload).not.toHaveProperty('class_id');
      expect(payload).not.toHaveProperty('dog_id');
      expect(payload).not.toHaveProperty('payment_status');

      const result = await table.get('entry-1');
      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry-1',
          showId: 'show-1',
          classId: 'class-1',
          dogId: 'dog-1',
          entryStatus: 'scratched',
          checkInStatus: 'pulled',
          withdrawalReason: 'Dog absent',
          _syncStatus: 'pending',
        })
      );
    });

    it('should throw error when updating status of non-existent entry', async () => {
      await expect(table.updateEntryStatus('nonexistent', 'checked-in')).rejects.toThrow(
        'Entry nonexistent not found'
      );
    });

    it('should support status transitions: registered -> checked-in -> scoring -> completed', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'registered',
      };

      await table.set('entry-1', entry);

      // Check in
      await table.updateEntryStatus('entry-1', 'checked-in');
      let result = await table.get('entry-1');
      expect(result?.status).toBe('checked-in');

      // Start scoring
      await table.updateEntryStatus('entry-1', 'scoring');
      result = await table.get('entry-1');
      expect(result?.status).toBe('scoring');

      // Complete
      await table.updateEntryStatus('entry-1', 'completed');
      result = await table.get('entry-1');
      expect(result?.status).toBe('completed');
    });
  });

  describe('Entry Updates', () => {
    it('should update entry with partial data', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'registered',
        dogCallName: 'Rex',
      };

      await table.set('entry-1', entry);
      await table.updateEntry('entry-1', { dogCallName: 'Max', status: 'checked-in' });

      const result = await table.get('entry-1');
      expect(result?.dogCallName).toBe('Max');
      expect(result?.status).toBe('checked-in');
      expect(result?.armband).toBe('101'); // Unchanged
    });

    it('should queue null final_placement when a reset clears both placement aliases', async () => {
      const queueMutation = vi.spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependencies?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      );

      await table.set('entry-1', {
        id: 'entry-1',
        classId: 'class-1',
        resultStatus: 'qualified',
        result_status: 'qualified',
        finalPlacement: '1',
        final_placement: '1',
      });

      await table.updateEntry('entry-1', {
        resultStatus: 'pending',
        result_status: 'pending',
        finalPlacement: null,
        final_placement: undefined,
      });

      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'entry-1',
        expect.objectContaining({
          result_status: 'pending',
          final_placement: null,
        })
      );
    });

    it('should mark entry as pending sync after update', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      };

      await table.set('entry-1', entry);
      await table.updateEntry('entry-1', { armband: '102' });

      const result = await table.get('entry-1');
      expect(result?._syncStatus).toBe('pending');
    });

    it('should queue withdrawal_reason when updating a day-of scratch', async () => {
      const queueMutation = vi.spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependencies?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      );

      await table.set('entry-1', {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      });
      await table.updateEntry('entry-1', {
        entryStatus: 'scratched',
        checkInStatus: 'pulled',
        withdrawalReason: 'Dog absent',
        specialRequests: 'Dog absent',
      });

      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'entry-1',
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason: 'Dog absent',
          special_requests: 'Dog absent',
        })
      );
    });

    it('should queue deleted_at when soft-deleting a move-up entry', async () => {
      const queueMutation = vi.spyOn(
        table as unknown as {
          queueMutation: (
            operation: string,
            rowId: string,
            payload: Record<string, unknown>,
            dependencies?: string[]
          ) => Promise<string | null>;
        },
        'queueMutation'
      );
      const deletedAt = '2026-06-05T18:00:00.000Z';

      await table.set('entry-1', {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      });
      await table.updateEntry('entry-1', {
        deletedAt,
        deleted_at: deletedAt,
      });

      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'entry-1',
        expect.objectContaining({
          deleted_at: deletedAt,
        })
      );
    });

    it('should throw error when updating non-existent entry', async () => {
      await expect(table.updateEntry('nonexistent', { armband: '102' })).rejects.toThrow(
        'Entry nonexistent not found'
      );
    });

    it('should update lastModified timestamp on update', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      };

      await table.set('entry-1', entry);
      const before = await table.get('entry-1');

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await table.updateEntry('entry-1', { armband: '102' });
      const after = await table.get('entry-1');

      expect(after?._lastModified).toBeDefined();
      expect(after?._lastModified).not.toEqual(before?._lastModified);
    });
  });

  describe('Entry Filtering and Search', () => {
    beforeEach(async () => {
      // Setup test data
      const entries: ReplicatedEntry[] = [
        { id: 'entry-1', classId: 'class-1', showId: 'show-1', armband: '101' },
        { id: 'entry-2', classId: 'class-1', showId: 'show-1', armband: '102' },
        { id: 'entry-3', classId: 'class-2', showId: 'show-1', armband: '201' },
        { id: 'entry-4', classId: 'class-1', showId: 'show-2', armband: '101' },
      ];

      for (const entry of entries) {
        await table.set(entry.id, entry);
      }
    });

    describe('getEntriesByClass', () => {
      it('should return entries for specific class', async () => {
        const results = await table.getEntriesByClass('class-1');
        expect(results).toHaveLength(3);
        expect(results.every(e => e.classId === 'class-1')).toBe(true);
      });

      it('should return empty array for non-existent class', async () => {
        const results = await table.getEntriesByClass('class-999');
        expect(results).toEqual([]);
      });

      it('should filter correctly across multiple classes', async () => {
        const class1Results = await table.getEntriesByClass('class-1');
        const class2Results = await table.getEntriesByClass('class-2');

        expect(class1Results).toHaveLength(3);
        expect(class2Results).toHaveLength(1);
      });
    });

    describe('getEntriesByShow', () => {
      it('should return entries for specific show', async () => {
        const results = await table.getEntriesByShow('show-1');
        expect(results).toHaveLength(3);
        expect(results.every(e => e.showId === 'show-1')).toBe(true);
      });

      it('should return empty array for non-existent show', async () => {
        const results = await table.getEntriesByShow('show-999');
        expect(results).toEqual([]);
      });

      it('should filter correctly across multiple shows', async () => {
        const show1Results = await table.getEntriesByShow('show-1');
        const show2Results = await table.getEntriesByShow('show-2');

        expect(show1Results).toHaveLength(3);
        expect(show2Results).toHaveLength(1);
      });
    });

    describe('getEntriesByArmband', () => {
      it('should return entries with specific armband', async () => {
        const results = await table.getEntriesByArmband('101');
        expect(results).toHaveLength(2);
        expect(results.every(e => e.armband === '101')).toBe(true);
      });

      it('should return empty array for non-existent armband', async () => {
        const results = await table.getEntriesByArmband('999');
        expect(results).toEqual([]);
      });

      it('should handle unique armbands correctly', async () => {
        const results = await table.getEntriesByArmband('102');
        expect(results).toHaveLength(1);
        expect(results[0]?.id).toBe('entry-2');
      });
    });

    describe('getEntryById', () => {
      it('should return entry by ID', async () => {
        const result = await table.getEntryById('entry-1');
        expect(result).not.toBeNull();
        expect(result?.id).toBe('entry-1');
      });

      it('should return null for non-existent ID', async () => {
        const result = await table.getEntryById('nonexistent');
        expect(result).toBeNull();
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

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(result.tableName).toBe('entries');
      expect(result.rowsAffected).toBe(0);
      expect(result.operation).toBe('full-sync');
    });

    it('should sync new entries from remote', async () => {
      // Mock remote entries
      const remoteEntries = [
        {
          id: 'entry-1',
          class_id: 'class-1',
          show_id: 'show-1',
          dog_id: 'dog-1',
          handler_id: 'handler-1',
          armband: '101',
          handler: 'John Doe',
          status: 'registered',
          entry_status: 'pending',
          jump_height: '16',
          entry_fee: 30,
          payment_status: 'paid',
          run_order: 1,
          move_up_requested: false,
          preferred_judge: null,
          special_requests: null,
          submitted_at: '2024-01-01T10:00:00Z',
          updated_at: '2024-01-01T10:00:00Z',
        },
      ];

      const mockQueryChain = {
        data: remoteEntries,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
      expect(result.operation).toBe('full-sync');

      // Verify entry was cached
      const entry = await table.get('entry-1');
      expect(entry).not.toBeNull();
      expect(entry?.classId).toBe('class-1');
      expect(entry?.armband).toBe('101');
    });

    it('should resolve conflicts during sync', async () => {
      // Setup local entry
      const localEntry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'checked-in',
      };
      await table.set('entry-1', localEntry);

      // Mock remote entry with different data
      const remoteEntries = [
        {
          id: 'entry-1',
          class_id: 'class-1',
          armband: '102', // Different armband
          status: 'registered', // Different status
          updated_at: new Date(Date.now() + 1000).toISOString(), // Newer
        },
      ];

      const mockQueryChain = {
        data: remoteEntries,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      // Server wins - remote data should be in cache
      const entry = await table.get('entry-1');
      expect(entry?.armband).toBe('102');
      expect(entry?.status).toBe('registered');
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

      const result = await table.sync(TEST_LICENSE_KEY);

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

      await table.sync(TEST_LICENSE_KEY);

      // Verify query construction. The select embeds the to-one dog so entry
      // cards can show call name / breed (see ReplicatedEntriesTable.sync).
      expect(supabaseMock.from).toHaveBeenCalledWith('entries');
      expect(mockSelect).toHaveBeenCalledWith('*, dogs(call_name, breed)');
      // ...and the sync scopes to the show (the behavior this test is named for).
      expect(mockEq).toHaveBeenCalledWith('show_id', expect.anything());
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
      await table.sync(TEST_LICENSE_KEY);
      const afterSync = Date.now();

      const metadata = await table.getSyncMetadata();
      // Full sync stamps lastFullSyncAt with the client clock (the 24h self-heal
      // baseline). The incremental watermark is now server-derived and stays 0 on
      // an empty fetch (no server updated_at observed) rather than the client clock.
      expect(metadata?.lastFullSyncAt).toBeGreaterThanOrEqual(beforeSync);
      expect(metadata?.lastFullSyncAt).toBeLessThanOrEqual(afterSync);
      expect(metadata?.syncStatus).toBe('idle');
    });

    it('should perform incremental sync based on lastSyncedAt', async () => {
      // Set last sync time
      const lastIncrementalSyncAt = Date.now() - 60000;
      await table.set('entry-1', {
        id: 'entry-1',
        showId: TEST_LICENSE_KEY,
        classId: 'class-1',
      });
      // Seed the watermark under the SHOW scope the sync reads — the incremental
      // watermark is now per-(table, scope.value), not table-global. sync() scopes
      // by show_id (TEST_LICENSE_KEY), so its `since` derives from this scope's
      // sub-record.
      await table.updateSyncMetadata(
        {
          lastIncrementalSyncAt,
          syncStatus: 'idle',
        },
        { scopeValue: TEST_LICENSE_KEY }
      );

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

      await table.sync(TEST_LICENSE_KEY);

      // Verify gt was called with a timestamp (incremental sync)
      expect(mockGt).toHaveBeenCalled();
      const gtArg = mockGt.mock.calls[0][1];
      expect(typeof gtArg).toBe('string'); // ISO timestamp string
      // since = watermark - high-churn incremental buffer (5000ms for entries/classes)
      expect(new Date(gtArg).getTime()).toBe(lastIncrementalSyncAt - 5000);
    });

    it('should preserve dirty local entries when remote has the same entry', async () => {
      await table.set(
        'entry-1',
        {
          id: 'entry-1',
          classId: 'class-1',
          runOrder: 3,
          _syncStatus: 'pending',
        },
        true
      );

      const remoteEntries = [
        {
          id: 'entry-1',
          class_id: 'class-1',
          run_order: 7,
          updated_at: new Date(Date.now() + 1000).toISOString(),
        },
      ];

      const mockQueryChain = {
        data: remoteEntries,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);

      const entry = await table.get('entry-1');
      expect(entry?.runOrder).toBe(3);
      await expect(table.getReplicatedRow('entry-1')).resolves.toMatchObject({
        isDirty: true,
        syncStatus: 'pending',
      });
    });

    it('should not resurrect an entry deleted locally during the same session', async () => {
      await table.set('entry-1', {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      });
      await table.deleteEntry('entry-1');

      const remoteEntries = [
        {
          id: 'entry-1',
          class_id: 'class-1',
          armband: '101',
          updated_at: new Date(Date.now() + 1000).toISOString(),
        },
      ];

      const mockQueryChain = {
        data: remoteEntries,
        error: null,
      };

      const mockEq = vi.fn().mockResolvedValue(mockQueryChain);
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockGt = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ gt: mockGt });

      vi.mocked(supabaseMock.from).mockReturnValue({
        select: mockSelect,
      });

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(await table.get('entry-1')).toBeNull();
    });

    it('should remove orphan local-only entries when no mutations are pending', async () => {
      await table.set('entry-1', {
        id: 'entry-1',
        showId: TEST_LICENSE_KEY,
        classId: 'class-1',
        _localOnly: true,
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

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(await table.get('entry-1')).toBeNull();
    });

    it('should keep orphan local-only entries outside the current show scope', async () => {
      await table.set('entry-1', {
        id: 'entry-1',
        showId: 'other-show',
        classId: 'class-1',
        _localOnly: true,
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

      const result = await table.sync(TEST_LICENSE_KEY);

      expect(result.success).toBe(true);
      expect(await table.get('entry-1')).toMatchObject({ showId: 'other-show' });
    });
  });

  describe('Conflict Resolution', () => {
    function getResolveConflict(t: typeof table) {
      return (
        t as unknown as {
          resolveConflict(local: ReplicatedEntry, remote: ReplicatedEntry): ReplicatedEntry;
        }
      ).resolveConflict.bind(t);
    }

    it('server wins when local is synced', async () => {
      const local: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
        status: 'checked-in',
        dogCallName: 'Rex',
        _syncStatus: 'synced',
      };
      const remote: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '102',
        status: 'registered',
        dogCallName: 'Max',
      };

      const resolved = getResolveConflict(table)(local, remote);

      expect(resolved).toBe(remote);
      expect(resolved.armband).toBe('102');
    });

    it('server wins when local has no _syncStatus', async () => {
      const local: ReplicatedEntry = { id: 'entry-1', isScored: true, totalPoints: 100 };
      const remote: ReplicatedEntry = { id: 'entry-1', isScored: false, totalPoints: 0 };

      const resolved = getResolveConflict(table)(local, remote);

      expect(resolved).toBe(remote);
    });

    it('local wins when local has pending unsynced changes', async () => {
      const local: ReplicatedEntry = {
        id: 'entry-1',
        runOrder: 3,
        _syncStatus: 'pending',
      };
      const remote: ReplicatedEntry = {
        id: 'entry-1',
        runOrder: 7,
      };

      const resolved = getResolveConflict(table)(local, remote);

      expect(resolved).toBe(local);
      expect(resolved.runOrder).toBe(3);
    });
  });

  describe('Data Transformation', () => {
    it('should transform database row to entry with camelCase fields', async () => {
      const remoteEntry = {
        id: 'entry-1',
        class_id: 'class-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        armband: '101',
        handler: 'John Doe',
        entry_status: 'pending',
        jump_height: '16',
        entry_fee: 30,
        payment_status: 'paid',
        run_order: 1,
        move_up_requested: false,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteEntry],
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

      await table.sync(TEST_LICENSE_KEY);

      const entry = await table.get('entry-1');
      expect(entry?.classId).toBe('class-1');
      expect(entry?.showId).toBe('show-1');
      expect(entry?.dogId).toBe('dog-1');
      expect(entry?.handlerId).toBe('handler-1');
      expect(entry?.entryStatus).toBe('pending');
      expect(entry?.jumpHeight).toBe('16');
      expect(entry?.entryFee).toBe(30);
      expect(entry?.paymentStatus).toBe('paid');
      expect(entry?.runOrder).toBe(1);
      expect(entry?.moveUpRequested).toBe(false);
    });

    it('should transform scoring fields correctly', async () => {
      const remoteEntry = {
        id: 'entry-1',
        is_scored: true,
        result_status: 'Q',
        result_text: 'Qualified',
        search_time_seconds: 120.5,
        total_points: 95,
        final_placement: 1,
        dog_call_name: 'Rex',
        dog_breed: 'German Shepherd',
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteEntry],
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

      await table.sync(TEST_LICENSE_KEY);

      const entry = await table.get('entry-1');
      expect(entry?.isScored).toBe(true);
      expect(entry?.is_scored).toBe(true);
      expect(entry?.resultStatus).toBe('Q');
      expect(entry?.result_status).toBe('Q');
      expect(entry?.searchTimeSeconds).toBe(120.5);
      expect(entry?.search_time_seconds).toBe(120.5);
      expect(entry?.totalPoints).toBe(95);
      expect(entry?.total_points).toBe(95);
      expect(entry?.finalPlacement).toBe('1');
      expect(entry?.final_placement).toBe('1');
      expect(entry?.dogCallName).toBe('Rex');
      expect(entry?.dog_call_name).toBe('Rex');
    });

    it('should handle null/undefined fields gracefully', async () => {
      const remoteEntry = {
        id: 'entry-1',
        class_id: 'class-1',
        show_id: null,
        dog_id: null,
        handler_id: null,
        armband: null,
        updated_at: '2024-01-01T10:00:00Z',
      };

      const mockQueryChain = {
        data: [remoteEntry],
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

      await table.sync(TEST_LICENSE_KEY);

      const entry = await table.get('entry-1');
      expect(entry?.classId).toBe('class-1');
      expect(entry?.showId).toBeUndefined();
      expect(entry?.dogId).toBeUndefined();
      expect(entry?.handlerId).toBeUndefined();
      expect(entry?.armband).toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const entries: ReplicatedEntry[] = [
        { id: 'entry-1', classId: 'class-1' },
        { id: 'entry-2', classId: 'class-1' },
        { id: 'entry-3', classId: 'class-2' },
      ];

      for (const entry of entries) {
        await table.set(entry.id, entry);
      }

      const stats = await table.getCacheStats();

      expect(stats.rowCount).toBe(3);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.sizeMB).toBeGreaterThan(0);
    });

    it('should clear cache', async () => {
      const entries: ReplicatedEntry[] = [
        { id: 'entry-1', classId: 'class-1' },
        { id: 'entry-2', classId: 'class-1' },
      ];

      for (const entry of entries) {
        await table.set(entry.id, entry);
      }

      await table.clearCache();

      const results = await table.getAll();
      expect(results).toEqual([]);
    });

    it('should track dirty entries after updates', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      };

      await table.set('entry-1', entry);
      await table.updateEntry('entry-1', { armband: '102' });

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

      // Add entry
      await table.set('entry-1', { id: 'entry-1', classId: 'class-1' });

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

      // Add entry after unsubscribe
      await table.set('entry-1', { id: 'entry-1', classId: 'class-1' });

      // Wait for potential notification
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle entries with all optional fields undefined', async () => {
      const minimalEntry: ReplicatedEntry = {
        id: 'entry-1',
      };

      await table.set('entry-1', minimalEntry);

      const result = await table.get('entry-1');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('entry-1');
    });

    it('should handle concurrent updates to same entry', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        armband: '101',
      };

      await table.set('entry-1', entry);

      // Perform concurrent updates
      const updates = [
        table.updateEntry('entry-1', { armband: '102' }),
        table.updateEntry('entry-1', { armband: '103' }),
        table.updateEntry('entry-1', { armband: '104' }),
      ];

      await Promise.all(updates);

      const result = await table.get('entry-1');
      expect(result?.armband).toMatch(/^10[234]$/); // One of the updates should win
    });

    it('should handle empty string IDs', async () => {
      const entry: ReplicatedEntry = {
        id: '',
        classId: 'class-1',
      };

      await table.set('', entry);

      const result = await table.get('');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('');
    });

    it('should handle very large armband numbers', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        armband: '999999999',
      };

      await table.set('entry-1', entry);

      const result = await table.get('entry-1');
      expect(result?.armband).toBe('999999999');
    });

    it('should handle special characters in string fields', async () => {
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        dogCallName: "Rex's Dog <script>",
        specialRequests: 'Need "special" treatment & care',
      };

      await table.set('entry-1', entry);

      const result = await table.get('entry-1');
      expect(result?.dogCallName).toBe("Rex's Dog <script>");
      expect(result?.specialRequests).toBe('Need "special" treatment & care');
    });
  });

  describe('Complex Workflows', () => {
    it('should handle complete check-in workflow', async () => {
      // 1. Entry is registered
      const entry: ReplicatedEntry = {
        id: 'entry-1',
        classId: 'class-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        armband: '101',
        status: 'registered',
        entryStatus: 'pending',
      };

      await table.set('entry-1', entry);

      // 2. Entry is checked in
      await table.updateEntryStatus('entry-1', 'checked-in');
      let result = await table.get('entry-1');
      expect(result?.status).toBe('checked-in');

      // 3. Entry starts scoring
      await table.updateEntryStatus('entry-1', 'scoring');
      result = await table.get('entry-1');
      expect(result?.status).toBe('scoring');

      // 4. Score is recorded
      await table.updateEntry('entry-1', {
        isScored: true,
        resultStatus: 'Q',
        searchTimeSeconds: 120.5,
        totalPoints: 95,
      });
      result = await table.get('entry-1');
      expect(result?.isScored).toBe(true);
      expect(result?.resultStatus).toBe('Q');

      // 5. Entry is completed
      await table.updateEntryStatus('entry-1', 'completed');
      result = await table.get('entry-1');
      expect(result?.status).toBe('completed');
    });

    it('should handle batch entry updates', async () => {
      // Create multiple entries
      const entries: ReplicatedEntry[] = Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i + 1}`,
        classId: 'class-1',
        armband: `${100 + i}`,
        status: 'registered',
      }));

      for (const entry of entries) {
        await table.set(entry.id, entry);
      }

      // Bulk update all entries to checked-in
      for (const entry of entries) {
        await table.updateEntryStatus(entry.id, 'checked-in');
      }

      // Verify all updated
      const results = await table.getEntriesByClass('class-1');
      expect(results).toHaveLength(10);
      expect(results.every(e => e.status === 'checked-in')).toBe(true);
    });

    it('should handle filtering entries by multiple criteria', async () => {
      const entries: ReplicatedEntry[] = [
        {
          id: 'entry-1',
          classId: 'class-1',
          showId: 'show-1',
          armband: '101',
          status: 'registered',
        },
        {
          id: 'entry-2',
          classId: 'class-1',
          showId: 'show-1',
          armband: '102',
          status: 'checked-in',
        },
        {
          id: 'entry-3',
          classId: 'class-1',
          showId: 'show-2',
          armband: '101',
          status: 'registered',
        },
        {
          id: 'entry-4',
          classId: 'class-2',
          showId: 'show-1',
          armband: '201',
          status: 'registered',
        },
      ];

      for (const entry of entries) {
        await table.set(entry.id, entry);
      }

      // Get all class-1 entries
      const class1Entries = await table.getEntriesByClass('class-1');
      expect(class1Entries).toHaveLength(3);

      // Get all show-1 entries
      const show1Entries = await table.getEntriesByShow('show-1');
      expect(show1Entries).toHaveLength(3);

      // Get all armband 101 entries
      const armband101Entries = await table.getEntriesByArmband('101');
      expect(armband101Entries).toHaveLength(2);

      // Manual filtering: class-1 + show-1
      const class1Show1 = class1Entries.filter(e => e.showId === 'show-1');
      expect(class1Show1).toHaveLength(2);
    });
  });
});
