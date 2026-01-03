/**
 * Tests for Entry Replication Module
 *
 * Tests cache reads, data transformation, and sync operations.
 */

/// <reference types="vitest" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEntriesFromReplicationCache, triggerImmediateEntrySync } from './entryReplication';
import { getReplicationManager } from '@/services/replication';
import type { Entry as ReplicatedEntry } from '@/services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '@/services/replication/tables/ReplicatedClassesTable';
import { buildClassName } from '@/utils/stringUtils';
import { formatTimeLimitSeconds } from '@/utils/timeUtils';
import { determineEntryStatus } from '@/utils/statusUtils';
import * as loggerModule from '@/utils/logger';

// Mock dependencies
vi.mock('@/services/replication', () => ({
  getReplicationManager: vi.fn()
}));

vi.mock('@/utils/stringUtils', () => ({
  buildClassName: vi.fn((element, level, section) => `${element} ${level}${section ? ` ${section}` : ''}`)
}));

vi.mock('@/utils/timeUtils', () => ({
  formatTimeLimitSeconds: vi.fn((seconds) => {
    if (seconds === undefined || seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  })
}));

vi.mock('@/utils/statusUtils', () => ({
  determineEntryStatus: vi.fn((entryStatus) => {
    if (entryStatus === 'completed') return 'completed';
    if (entryStatus === 'in-ring') return 'in-ring';
    return 'no-status';
  })
}));

describe('entryReplication', () => {
  const mockEntriesTable = {
    get: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };

  const mockClassesTable = {
    get: vi.fn(),
    getAll: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };

  const mockReplicationManager = {
    getTable: vi.fn(),
    syncTable: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup getTable to return appropriate mock tables
    mockReplicationManager.getTable.mockImplementation((tableName: string) => {
      if (tableName === 'entries') return mockEntriesTable;
      if (tableName === 'classes') return mockClassesTable;
      return null;
    });

    // Default: return mock manager
    vi.mocked(getReplicationManager).mockReturnValue(mockReplicationManager as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getEntriesFromReplicationCache', () => {
    const mockClass: Class = {
      id: '123',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      area_count: 1,
      time_limit_seconds: 180,
      time_limit_area2_seconds: undefined,
      time_limit_area3_seconds: undefined,
      trial_id: 456,
      license_key: 'TEST-KEY',
      judge_name: 'Judge Smith',
      is_scoring_finalized: false,
      class_status: 'not_started',
      created_at: '2025-01-19T00:00:00Z',
      updated_at: '2025-01-19T00:00:00Z'
    };

    const mockReplicatedEntries: ReplicatedEntry[] = [
      {
        id: '1',
        class_id: '123',
        armband_number: 101,
        dog_call_name: 'Max',
        dog_breed: 'Border Collie',
        handler_name: 'John Doe',
        entry_status: 'completed',
        is_scored: true,
        is_in_ring: false,
        result_status: 'qualified',
        search_time_seconds: 45.5,
        total_faults: 0,
        final_placement: 1,
        license_key: 'TEST-KEY',
        created_at: '2025-01-19T00:00:00Z',
        updated_at: '2025-01-19T00:00:00Z'
      },
      {
        id: '2',
        class_id: '123',
        armband_number: 102,
        dog_call_name: 'Bella',
        dog_breed: 'Golden Retriever',
        handler_name: 'Jane Smith',
        entry_status: 'in-ring',
        is_scored: false,
        is_in_ring: true,
        result_status: 'pending',
        search_time_seconds: 0,
        total_faults: 0,
        final_placement: undefined,
        license_key: 'TEST-KEY',
        created_at: '2025-01-19T00:00:00Z',
        updated_at: '2025-01-19T00:00:00Z'
      }
    ];

    it('should return null when replication manager is not available', async () => {
      vi.mocked(getReplicationManager).mockReturnValue(null);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toBeNull();
    });

    it('should return null when entries table is not available', async () => {
      mockReplicationManager.getTable.mockImplementation((tableName: string) => {
        if (tableName === 'entries') return null;
        if (tableName === 'classes') return mockClassesTable;
        return null;
      });

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toBeNull();
    });

    it('should return null when classes table is not available', async () => {
      mockReplicationManager.getTable.mockImplementation((tableName: string) => {
        if (tableName === 'entries') return mockEntriesTable;
        if (tableName === 'classes') return null;
        return null;
      });

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toBeNull();
    });

    it('should return null when class is not found in cache', async () => {
      mockClassesTable.get.mockResolvedValue(null);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toBeNull();
      expect(mockClassesTable.get).toHaveBeenCalledWith('123');
    });

    it('should successfully fetch and transform entries from cache', async () => {
      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue(mockReplicatedEntries);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);

      // Check first entry (completed)
      expect(result![0]).toMatchObject({
        id: 1,
        armband: 101,
        callName: 'Max',
        breed: 'Border Collie',
        handler: 'John Doe',
        isScored: true,
        status: 'completed',
        resultText: 'qualified',
        searchTime: '45.5',
        faultCount: 0,
        placement: 1
      });

      // Check second entry (in-ring)
      expect(result![1]).toMatchObject({
        id: 2,
        armband: 102,
        callName: 'Bella',
        breed: 'Golden Retriever',
        handler: 'Jane Smith',
        isScored: false,
        status: 'in-ring',
        resultText: 'pending',
        searchTime: '0'
      });
    });

    it('should filter entries for correct class IDs', async () => {
      const multiClassEntries: ReplicatedEntry[] = [
        { ...mockReplicatedEntries[0], class_id: '123' },
        { ...mockReplicatedEntries[1], class_id: '124' },
        { ...mockReplicatedEntries[0], id: '3', class_id: '125', armband_number: 103 }
      ];

      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue(multiClassEntries);

      // Request entries for classes 123 and 124 (combined Novice A & B)
      const result = await getEntriesFromReplicationCache([123, 124], 123);

      expect(result).toHaveLength(2);
      expect(result![0].classId).toBe(123);
      expect(result![1].classId).toBe(124);
    });

    it('should sort entries by armband number', async () => {
      const unsortedEntries: ReplicatedEntry[] = [
        { ...mockReplicatedEntries[0], id: '1', armband_number: 105 },
        { ...mockReplicatedEntries[1], id: '2', armband_number: 101 },
        { ...mockReplicatedEntries[0], id: '3', armband_number: 103 }
      ];

      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue(unsortedEntries);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].armband).toBe(101);
      expect(result![1].armband).toBe(103);
      expect(result![2].armband).toBe(105);
    });

    it('should handle missing breed field', async () => {
      const entryWithoutBreed: ReplicatedEntry = {
        ...mockReplicatedEntries[0],
        dog_breed: undefined
      };

      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([entryWithoutBreed]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].breed).toBe('');
    });

    it('should format time limits correctly', async () => {
      const classWithMultipleAreas: Class = {
        ...mockClass,
        area_count: 3,
        time_limit_seconds: 180,
        time_limit_area2_seconds: 120,
        time_limit_area3_seconds: 90
      };

      mockClassesTable.get.mockResolvedValue(classWithMultipleAreas);
      mockEntriesTable.getAll.mockResolvedValue([mockReplicatedEntries[0]]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].timeLimit).toBe('3:00');
      expect(result![0].timeLimit2).toBe('2:00');
      expect(result![0].timeLimit3).toBe('1:30');
    });

    it('should map deprecated fields for backward compatibility', async () => {
      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([mockReplicatedEntries[1]]); // in-ring entry

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].inRing).toBe(true);
      expect(result![0].checkedIn).toBe(true);
      expect(result![0].checkinStatus).toBe('in-ring');
    });

    it('should handle cache read errors gracefully', async () => {
      mockClassesTable.get.mockRejectedValue(new Error('Cache read failed'));

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toBeNull();
    });

    it('should return empty array when no entries match class IDs', async () => {
      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([
        { ...mockReplicatedEntries[0], class_id: '999' }
      ]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result).toEqual([]);
    });
  });

  describe('triggerImmediateEntrySync', () => {
    it('should trigger immediate sync when manager is available', async () => {
      const mockSyncManager = {
        syncTable: vi.fn().mockResolvedValue(undefined)
      };

      // Mock dynamic import
      vi.doMock('./replication', () => ({
        getReplicationManager: () => mockSyncManager
      }));

      await triggerImmediateEntrySync('submitScore');

      expect(mockSyncManager.syncTable).toHaveBeenCalledWith('entries', { forceFullSync: false });
    });

    it('should log warning when manager is not available', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.doMock('./replication', () => ({
        getReplicationManager: () => null
      }));

      await triggerImmediateEntrySync('submitScore');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Replication manager not available')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle sync errors gracefully', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockSyncManager = {
        syncTable: vi.fn().mockRejectedValue(new Error('Sync failed'))
      };

      vi.doMock('./replication', () => ({
        getReplicationManager: () => mockSyncManager
      }));

      await triggerImmediateEntrySync('submitScore');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to trigger immediate sync'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should include operation name in log messages', async () => {
      const loggerLogSpy = vi.spyOn(loggerModule.logger, 'log').mockImplementation(() => {});

      const mockSyncManager = {
        syncTable: vi.fn().mockResolvedValue(undefined)
      };

      vi.doMock('./replication', () => ({
        getReplicationManager: () => mockSyncManager
      }));

      await triggerImmediateEntrySync('resetEntryScore');

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[resetEntryScore]')
      );

      loggerLogSpy.mockRestore();
    });
  });

  describe('Data Transformation', () => {
    const mockClass: Class = {
      id: '123',
      element: 'Interior',
      level: 'Excellent',
      section: 'B',
      area_count: 2,
      time_limit_seconds: 240,
      time_limit_area2_seconds: 180,
      time_limit_area3_seconds: undefined,
      trial_id: 456,
      license_key: 'TEST-KEY',
      judge_name: 'Judge Smith',
      is_scoring_finalized: false,
      class_status: 'not_started',
      created_at: '2025-01-19T00:00:00Z',
      updated_at: '2025-01-19T00:00:00Z'
    };

    const baseReplicatedEntry: ReplicatedEntry = {
      id: '1',
      class_id: '123',
      armband_number: 101,
      dog_call_name: 'Max',
      dog_breed: 'Border Collie',
      handler_name: 'John Doe',
      entry_status: 'completed',
      is_scored: true,
      is_in_ring: false,
      result_status: 'qualified',
      search_time_seconds: 45.5,
      total_faults: 0,
      final_placement: 1,
      license_key: 'TEST-KEY',
      created_at: '2025-01-19T00:00:00Z',
      updated_at: '2025-01-19T00:00:00Z'
    };

    it('should transform entry with null placement', async () => {
      const entryWithNullPlacement: ReplicatedEntry = {
        ...baseReplicatedEntry,
        final_placement: undefined
      };

      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([entryWithNullPlacement]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].placement).toBeUndefined();
    });

    it('should transform entry with zero search time', async () => {
      const entryWithZeroTime: ReplicatedEntry = {
        ...baseReplicatedEntry,
        search_time_seconds: 0
      };

      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([entryWithZeroTime]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].searchTime).toBe('0');
    });

    it('should set default values for missing optional fields', async () => {
      mockClassesTable.get.mockResolvedValue(mockClass);
      mockEntriesTable.getAll.mockResolvedValue([baseReplicatedEntry]);

      const result = await getEntriesFromReplicationCache([123], 123);

      expect(result![0].jumpHeight).toBe('');
      expect(result![0].preferredTime).toBe('');
      expect(result![0].correctFinds).toBe(0);
      expect(result![0].incorrectFinds).toBe(0);
      expect(result![0].noFinishCount).toBe(0);
      expect(result![0].totalPoints).toBe(0);
      expect(result![0].exhibitorOrder).toBe(0);
      expect(result![0].trialDate).toBe('');
      expect(result![0].trialNumber).toBe('');
    });
  });
});
