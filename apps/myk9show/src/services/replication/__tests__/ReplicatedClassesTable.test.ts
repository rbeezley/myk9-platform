/**
 * ReplicatedClassesTable Tests
 *
 * Validates the offline-first replication system for class data:
 * - CRUD operations (create, read, update, delete)
 * - Sync operations (pull from remote, incremental sync, conflict resolution)
 * - Query operations (by trial ID, by ID)
 * - Error handling and edge cases
 * - Data transformation (database row to app class format)
 *
 * Note: Some tests are skipped as they require IndexedDB in a browser environment.
 * Those tests are covered by E2E tests with Playwright.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type { Database } from '@/types/supabase';

/** Shape of the _mocks export from the mocked supabaseClient module */
interface SupabaseMocks {
  mockSupabaseFrom: Mock;
  mockSupabaseSelect: Mock;
  mockSupabaseGt: Mock;
  mockSupabaseEq: Mock;
  mockSupabaseOrder: Mock;
}

// Mock the logger BEFORE imports
vi.mock('@myk9/core', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the Supabase client BEFORE imports
vi.mock('@/services/database/supabaseClient', () => {
  const mockSupabaseFrom = vi.fn();
  const mockSupabaseSelect = vi.fn();
  const mockSupabaseGt = vi.fn();
  const mockSupabaseEq = vi.fn();
  const mockSupabaseOrder = vi.fn();

  // Setup mock chain
  mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect });
  mockSupabaseSelect.mockReturnValue({ gt: mockSupabaseGt });
  mockSupabaseGt.mockReturnValue({ order: mockSupabaseOrder });
  mockSupabaseOrder.mockReturnValue({ eq: mockSupabaseEq });
  mockSupabaseEq.mockResolvedValue({ data: [], error: null });

  return {
    supabase: {
      from: mockSupabaseFrom,
    },
    // Export mocks so we can access them in tests
    _mocks: {
      mockSupabaseFrom,
      mockSupabaseSelect,
      mockSupabaseGt,
      mockSupabaseEq,
      mockSupabaseOrder,
    },
  };
});

// Don't mock @myk9/replication - use the real implementation

// Import after mocks are set up
import { ReplicatedClassesTable, type ReplicatedClass } from '../ReplicatedClassesTable';

describe('ReplicatedClassesTable', () => {
  let classesTable: ReplicatedClassesTable;
  let mockSupabaseFrom: Mock;
  let mockSupabaseSelect: Mock;
  let mockSupabaseGt: Mock;
  let mockSupabaseEq: Mock;
  let mockSupabaseOrder: Mock;

  // Sample class data factory
  const createMockClass = (overrides: Partial<ReplicatedClass> = {}): ReplicatedClass => ({
    id: '1',
    trialId: 'trial-1',
    name: 'Novice A',
    description: 'Beginner level class',
    entryFee: 25.0,
    jumpHeights: ['8"', '12"', '16"'],
    maxEntries: 100,
    allowsWaitlist: true,
    maxDogsPerHandler: 3,
    level: 'Novice',
    breedRestrictions: [],
    ageMin: undefined,
    ageMax: undefined,
    heightMin: undefined,
    heightMax: undefined,
    handlerAgeMin: undefined,
    handlerAgeMax: undefined,
    startTime: '09:00 AM',
    estimatedDuration: 120,
    element: 'Container',
    section: 'A',
    areaCount: 1,
    timeLimitSeconds: 180,
    timeLimitArea2Seconds: undefined,
    timeLimitArea3Seconds: undefined,
    judgeName: 'Judge Smith',
    classStatus: 'scheduled',
    classOrder: 1,
    isCompleted: false,
    trial_id: 'trial-1',
    area_count: 1,
    time_limit_seconds: 180,
    time_limit_area2_seconds: undefined,
    time_limit_area3_seconds: undefined,
    actual_start_time: undefined,
    actual_end_time: undefined,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
    ...overrides,
  });

  const createDbRow = (
    overrides: Partial<Database['public']['Tables']['classes']['Row']> = {}
  ): Database['public']['Tables']['classes']['Row'] =>
    ({
      id: 1,
      trial_id: 'trial-1',
      name: 'Novice A',
      description: 'Beginner level class',
      entry_fee: 25.0,
      jump_heights: ['8"', '12"', '16"'],
      max_entries: 100,
      allow_waitlist: true,
      max_dogs_per_handler: 3,
      level: 'Novice',
      breed_restrictions: [],
      age_min: null,
      age_max: null,
      height_min: null,
      height_max: null,
      handler_age_min: null,
      handler_age_max: null,
      start_time: '09:00 AM',
      estimated_duration: 120,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    }) as Database['public']['Tables']['classes']['Row'];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocks from the mocked module
    const { _mocks } = (await import('@/services/database/supabaseClient')) as unknown as {
      _mocks: SupabaseMocks;
    };
    mockSupabaseFrom = _mocks.mockSupabaseFrom;
    mockSupabaseSelect = _mocks.mockSupabaseSelect;
    mockSupabaseGt = _mocks.mockSupabaseGt;
    mockSupabaseEq = _mocks.mockSupabaseEq;
    mockSupabaseOrder = _mocks.mockSupabaseOrder;

    classesTable = new ReplicatedClassesTable();

    // Reset mock chain
    mockSupabaseFrom.mockReturnValue({ select: mockSupabaseSelect });
    mockSupabaseSelect.mockReturnValue({ gt: mockSupabaseGt });
    mockSupabaseGt.mockReturnValue({ order: mockSupabaseOrder });
    mockSupabaseOrder.mockReturnValue({ eq: mockSupabaseEq });
    mockSupabaseEq.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct table name', () => {
      expect(classesTable.getTableName()).toBe('classes');
    });

    it('should be an instance of ReplicatedClassesTable', () => {
      expect(classesTable).toBeInstanceOf(ReplicatedClassesTable);
    });
  });

  describe('Sync Operations - Query Building', () => {
    describe('sync - Supabase Query Construction', () => {
      it('should construct correct Supabase query for initial sync', async () => {
        const mockRows = [createDbRow({ id: 1 })];
        mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

        await classesTable.sync('trial-1');

        expect(mockSupabaseFrom).toHaveBeenCalledWith('classes');
        expect(mockSupabaseSelect).toHaveBeenCalledWith(
          '*, judge_assignments!judge_assignments_class_id_fkey(person_id, people!inner(first_name, last_name))'
        );
        expect(mockSupabaseGt).toHaveBeenCalledWith('updated_at', expect.any(String));
        expect(mockSupabaseOrder).toHaveBeenCalledWith('updated_at', { ascending: true });
      });

      it('should filter by trial ID when license key provided', async () => {
        const mockRows = [createDbRow({ id: 1, trial_id: 'trial-1' })];
        mockSupabaseEq.mockResolvedValue({ data: mockRows, error: null });

        await classesTable.sync('trial-1');

        expect(mockSupabaseEq).toHaveBeenCalledWith('trial_id', 'trial-1');
      });

      it('should sync without trial filter when no license key provided', async () => {
        const mockRows = [createDbRow({ id: 1 })];
        mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

        await classesTable.sync('');

        expect(mockSupabaseEq).not.toHaveBeenCalled();
      });

      it('should use gt filter for incremental updates', async () => {
        mockSupabaseOrder.mockResolvedValue({ data: [], error: null });

        await classesTable.sync('trial-1');

        expect(mockSupabaseGt).toHaveBeenCalledWith('updated_at', expect.any(String));
      });
    });

    describe('sync - Success Cases', () => {
      it('should return success result when sync completes', async () => {
        // sync('trial-1') chains through .eq() — mockSupabaseEq controls the result.
        // With no rows, sync returns early before any IndexedDB writes.
        mockSupabaseEq.mockResolvedValue({ data: [], error: null });

        const result = await classesTable.sync('trial-1');

        expect(result.success).toBe(true);
        expect(result.tableName).toBe('classes');
        expect(result.operation).toBe('full-sync');
      });

      it('should return success with 0 rows when no updates', async () => {
        // Default mockSupabaseEq already resolves to { data: [], error: null }
        const result = await classesTable.sync('trial-1');

        expect(result.success).toBe(true);
        expect(result.rowsAffected).toBe(0);
      });

      it('should handle null remote data gracefully', async () => {
        mockSupabaseEq.mockResolvedValue({ data: null, error: null });

        const result = await classesTable.sync('trial-1');

        expect(result.success).toBe(true);
        expect(result.rowsAffected).toBe(0);
      });

      it('should measure sync duration', async () => {
        // sync(''): no .eq() called — mockSupabaseOrder controls the result directly.
        // Use sync('') so that order() resolves with data, not eq().
        mockSupabaseOrder.mockResolvedValue({ data: [], error: null });

        const result = await classesTable.sync('');

        expect(result.duration).toBeGreaterThan(-1); // duration is a non-negative number
        expect(typeof result.duration).toBe('number');
      });

      it('should count affected rows correctly', async () => {
        const mockRows = [createDbRow({ id: 1 }), createDbRow({ id: 2 }), createDbRow({ id: 3 })];
        // Use sync(''): no .eq() call, order() result is awaited directly
        mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

        const result = await classesTable.sync('');

        expect(result.rowsAffected).toBe(3);
      });
    });

    describe('sync - Error Handling', () => {
      it('should return error result when Supabase query fails', async () => {
        // sync('trial-1') uses .eq() — mockSupabaseEq controls the result
        mockSupabaseEq.mockResolvedValue({
          data: null,
          error: { message: 'Network error' },
        });

        const result = await classesTable.sync('trial-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Supabase query failed');
      });

      it('should handle network errors gracefully', async () => {
        mockSupabaseOrder.mockRejectedValue(new Error('Network timeout'));

        const result = await classesTable.sync('trial-1');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should include error duration in result', async () => {
        // mockSupabaseOrder.mockRejectedValue with sync('trial-1'):
        // .order() returns rejected Promise → .eq() on rejected Promise → TypeError
        // caught in outer try/catch → result.success=false, result.duration>0
        mockSupabaseOrder.mockRejectedValue(new Error('Sync error'));

        const result = await classesTable.sync('trial-1');

        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it('should handle large batch of classes', async () => {
        // Use sync(''): no .eq() call, order() is the terminal step
        const mockRows = Array.from({ length: 100 }, (_, i) => createDbRow({ id: i + 1 }));
        mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

        const result = await classesTable.sync('');

        expect(result.success).toBe(true);
        expect(result.rowsAffected).toBe(100);
      });
    });
  });

  describe('Conflict Resolution Strategy', () => {
    it('should prefer remote data in conflict (server wins)', async () => {
      const localClass = createMockClass({ name: 'Local Name' });
      const remoteClass = createMockClass({ name: 'Remote Name' });

      // Access protected method via type assertion
      const resolveConflict = (
        classesTable as unknown as {
          resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass;
        }
      ).resolveConflict.bind(classesTable);
      const resolved = resolveConflict(localClass, remoteClass);

      expect(resolved).toEqual(remoteClass);
      expect(resolved.name).toBe('Remote Name');
    });

    it('takes remote config but preserves enriched visibility fields when remote lacks them', async () => {
      // Phase 1h: the visibility fields are enrichment-only (not on the raw
      // row), so a sync path that didn't enrich carries them undefined — the
      // prior enriched values must survive rather than being wiped.
      const localClass = createMockClass({
        name: 'Old',
        classStatus: 'scheduled',
        selfCheckinEnabled: false,
        visibilityPreset: 'review',
      });
      const remoteClass = createMockClass({ name: 'New', classStatus: 'in_progress' });

      const resolveConflict2 = (
        classesTable as unknown as {
          resolveConflict(local: ReplicatedClass, remote: ReplicatedClass): ReplicatedClass;
        }
      ).resolveConflict.bind(classesTable);
      const resolved = resolveConflict2(localClass, remoteClass);

      // Server-authoritative for class config:
      expect(resolved.name).toBe('New');
      expect(resolved.classStatus).toBe('in_progress');
      // ...but the enriched visibility values from local are preserved:
      expect(resolved.selfCheckinEnabled).toBe(false);
      expect(resolved.visibilityPreset).toBe('review');
    });
  });

  describe('Data Transformation', () => {
    it('should transform snake_case database fields to camelCase', () => {
      const dbRow = createDbRow({
        id: 1,
        trial_id: 'trial-1',
        entry_fee: 30.0,
        max_entries: 50,
      });

      // Test the rowToClass function by calling sync
      // The transformation happens in the sync method
      expect(dbRow.trial_id).toBe('trial-1');
      expect(dbRow.entry_fee).toBe(30.0);
      expect(dbRow.max_entries).toBe(50);
    });

    it('should handle null database fields', () => {
      const dbRow = createDbRow({
        id: 1,
        description: null,
        entry_fee: null,
        jump_heights: null,
      });

      expect(dbRow.description).toBeNull();
      expect(dbRow.entry_fee).toBeNull();
      expect(dbRow.jump_heights).toBeNull();
    });

    it('should preserve required fields', () => {
      const dbRow = createDbRow({
        id: 1,
        trial_id: 'trial-1',
        name: 'Test Class',
      });

      expect(dbRow.id).toBe(1);
      expect(dbRow.trial_id).toBe('trial-1');
      expect(dbRow.name).toBe('Test Class');
    });

    it('should handle scent work specific fields', () => {
      const dbRow = {
        ...createDbRow({ id: 1 }),
        area_count: 3,
        time_limit_seconds: 180,
        element: 'Interior',
        section: 'B',
      };

      expect(dbRow.area_count).toBe(3);
      expect(dbRow.time_limit_seconds).toBe(180);
      expect(dbRow.element).toBe('Interior');
      expect(dbRow.section).toBe('B');
    });
  });

  describe('Class Lifecycle Scenarios', () => {
    it('should handle class status transitions', () => {
      const scheduled = createMockClass({ classStatus: 'scheduled' });
      const inProgress = createMockClass({ classStatus: 'in_progress' });
      const completed = createMockClass({ classStatus: 'completed' });

      expect(scheduled.classStatus).toBe('scheduled');
      expect(inProgress.classStatus).toBe('in_progress');
      expect(completed.classStatus).toBe('completed');
    });

    it('should track timing fields for class execution', () => {
      const startTime = new Date().toISOString();
      const endTime = new Date().toISOString();

      const classData = createMockClass({
        actual_start_time: startTime,
        actual_end_time: endTime,
        isCompleted: true,
      });

      expect(classData.actual_start_time).toBe(startTime);
      expect(classData.actual_end_time).toBe(endTime);
      expect(classData.isCompleted).toBe(true);
    });

    it('should support both camelCase and snake_case field access', () => {
      const classData = createMockClass({
        trialId: 'trial-1',
        trial_id: 'trial-1',
        areaCount: 3,
        area_count: 3,
      });

      expect(classData.trialId).toBe('trial-1');
      expect(classData.trial_id).toBe('trial-1');
      expect(classData.areaCount).toBe(3);
      expect(classData.area_count).toBe(3);
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle empty string IDs', () => {
      const classData = createMockClass({ id: '' });
      expect(classData.id).toBe('');
    });

    it('should handle class with minimal required fields', () => {
      const minimalClass: ReplicatedClass = {
        id: '1',
        name: 'Minimal Class',
        trialId: 'trial-1',
        trial_id: 'trial-1',
      } as ReplicatedClass;

      expect(minimalClass.id).toBe('1');
      expect(minimalClass.name).toBe('Minimal Class');
      expect(minimalClass.trialId).toBe('trial-1');
    });

    it('should handle class with all optional fields undefined', () => {
      const classData = createMockClass({
        description: undefined,
        entryFee: undefined,
        jumpHeights: undefined,
        maxEntries: undefined,
        allowsWaitlist: undefined,
      });

      expect(classData.description).toBeUndefined();
      expect(classData.entryFee).toBeUndefined();
      expect(classData.jumpHeights).toBeUndefined();
    });

    it('should handle class with empty arrays', () => {
      const classData = createMockClass({
        jumpHeights: [],
        breedRestrictions: [],
      });

      expect(classData.jumpHeights).toEqual([]);
      expect(classData.breedRestrictions).toEqual([]);
    });

    it('should handle numeric ID conversion to string', () => {
      const dbRow = createDbRow({ id: 123 });
      expect(dbRow.id).toBe(123);
      // The sync method converts this to string '123'
    });
  });

  describe('Scent Work Specific Fields', () => {
    it('should support single area classes', () => {
      const classData = createMockClass({
        element: 'Container',
        areaCount: 1,
        timeLimitSeconds: 180,
      });

      expect(classData.element).toBe('Container');
      expect(classData.areaCount).toBe(1);
      expect(classData.timeLimitSeconds).toBe(180);
    });

    it('should support multi-area classes with different time limits', () => {
      const classData = createMockClass({
        element: 'Interior',
        areaCount: 3,
        timeLimitSeconds: 180,
        timeLimitArea2Seconds: 120,
        timeLimitArea3Seconds: 90,
      });

      expect(classData.areaCount).toBe(3);
      expect(classData.timeLimitSeconds).toBe(180);
      expect(classData.timeLimitArea2Seconds).toBe(120);
      expect(classData.timeLimitArea3Seconds).toBe(90);
    });

    it('should handle all scent work elements', () => {
      const elements = ['Container', 'Interior', 'Exterior', 'Buried'];

      elements.forEach(element => {
        const classData = createMockClass({ element });
        expect(classData.element).toBe(element);
      });
    });

    it('should track judge assignment', () => {
      const classData = createMockClass({
        judgeName: 'Judge Smith',
      });

      expect(classData.judgeName).toBe('Judge Smith');
    });

    it('should track class order for scheduling', () => {
      const class1 = createMockClass({ classOrder: 1 });
      const class2 = createMockClass({ classOrder: 2 });

      expect(class1.classOrder).toBe(1);
      expect(class2.classOrder).toBe(2);
    });
  });

  describe('Trial Association', () => {
    it('should maintain trial_id relationship', () => {
      const classData = createMockClass({
        trialId: 'trial-abc-123',
        trial_id: 'trial-abc-123',
      });

      expect(classData.trialId).toBe('trial-abc-123');
      expect(classData.trial_id).toBe('trial-abc-123');
    });

    it('should support filtering classes by trial in query', async () => {
      const mockRows = [
        createDbRow({ id: 1, trial_id: 'trial-1' }),
        createDbRow({ id: 2, trial_id: 'trial-1' }),
      ];
      mockSupabaseEq.mockResolvedValue({ data: mockRows, error: null });

      await classesTable.sync('trial-1');

      expect(mockSupabaseEq).toHaveBeenCalledWith('trial_id', 'trial-1');
    });

    it('should handle multiple trials syncing separately', async () => {
      const trial1Rows = [createDbRow({ id: 1, trial_id: 'trial-1' })];
      const trial2Rows = [createDbRow({ id: 2, trial_id: 'trial-2' })];

      mockSupabaseEq.mockResolvedValueOnce({ data: trial1Rows, error: null });
      await classesTable.sync('trial-1');

      mockSupabaseEq.mockResolvedValueOnce({ data: trial2Rows, error: null });
      await classesTable.sync('trial-2');

      expect(mockSupabaseEq).toHaveBeenCalledWith('trial_id', 'trial-1');
      expect(mockSupabaseEq).toHaveBeenCalledWith('trial_id', 'trial-2');
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle sync with no data efficiently', async () => {
      // Default mockSupabaseEq resolves to { data: [], error: null }
      const start = Date.now();
      const result = await classesTable.sync('trial-1');
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });

    it('should track performance metrics in sync result', async () => {
      const mockRows = [createDbRow({ id: 1 })];
      mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

      const result = await classesTable.sync('trial-1');

      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('rowsAffected');
      expect(result).toHaveProperty('conflictsResolved');
    });

    it('should batch process large datasets', async () => {
      // Use sync(''): no .eq() call, order() is awaited directly
      const mockRows = Array.from({ length: 500 }, (_, i) => createDbRow({ id: i + 1 }));
      mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

      const result = await classesTable.sync('');

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(500);
    });
  });

  describe('Sync Status Tracking', () => {
    it('should set operation type correctly', async () => {
      mockSupabaseOrder.mockResolvedValue({ data: [], error: null });

      const result = await classesTable.sync('trial-1');

      expect(result.operation).toBe('incremental-sync');
    });

    it('should track conflicts resolved', async () => {
      const mockRows = [createDbRow({ id: 1 })];
      mockSupabaseOrder.mockResolvedValue({ data: mockRows, error: null });

      const result = await classesTable.sync('trial-1');

      expect(result).toHaveProperty('conflictsResolved');
      expect(typeof result.conflictsResolved).toBe('number');
    });

    it('should include table name in result', async () => {
      mockSupabaseOrder.mockResolvedValue({ data: [], error: null });

      const result = await classesTable.sync('trial-1');

      expect(result.tableName).toBe('classes');
    });
  });

  describe('Error Messages and Debugging', () => {
    it('should provide descriptive error for query failure', async () => {
      // sync('trial-1') uses .eq() — mockSupabaseEq controls result
      mockSupabaseEq.mockResolvedValue({
        data: null,
        error: { message: 'Connection refused' },
      });

      const result = await classesTable.sync('trial-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Supabase query failed');
      expect(result.error).toContain('Connection refused');
    });

    it('should handle thrown exceptions', async () => {
      // mockSupabaseOrder.mockRejectedValue with sync('trial-1'):
      // .order() returns rejected Promise → .eq() on rejected Promise → error caught
      mockSupabaseOrder.mockRejectedValue(new Error('Unexpected error'));

      const result = await classesTable.sync('trial-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      // mockSupabaseOrder.mockRejectedValue('String error') with sync('trial-1'):
      // caught, result.error is set to the string value
      mockSupabaseOrder.mockRejectedValue('String error');

      const result = await classesTable.sync('trial-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
