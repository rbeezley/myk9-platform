import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { 
  useConflictResolution, 
  useFormConflictResolution,
  useShowConflictResolution 
} from '../../hooks/useConflictResolution';
import { ResolutionStrategy, ConflictPriority } from '../../services/conflict/ConflictResolver';
import { conflictManager } from '../../services/conflict/ConflictManager';
import { SyncMetadata } from '../../types/sync-types';

// Mock the auth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      role: 'secretary',
      permissions: ['show_edit', 'entry_manage']
    }
  })
}));

// Mock conflict manager
vi.mock('../../services/conflict/ConflictManager', () => ({
  conflictManager: {
    getConflictStats: vi.fn(),
    getPendingConflicts: vi.fn(),
    getResolutionHistory: vi.fn(),
    resolveConflictManually: vi.fn(),
    handleSyncConflict: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

interface TestEntity extends SyncMetadata {
  id: string;
  name: string;
  status: string;
}

describe('useConflictResolution', () => {
  const mockStats = {
    totalConflicts: 5,
    resolvedConflicts: 3,
    pendingConflicts: 2,
    autoResolvedConflicts: 2,
    manualResolvedConflicts: 1,
    criticalConflicts: 0,
    conflictsByType: { field_conflict: 3, version_mismatch: 2 },
    conflictsByEntity: { show: 2, registration: 3 },
    averageResolutionTime: 5000
  };

  const mockConflicts = [
    {
      id: 'conflict-1',
      entityType: 'show',
      entityId: 'show-1',
      conflictType: 'field_conflict',
      priority: ConflictPriority.MEDIUM,
      detectedAt: new Date(),
      details: [],
      localEntity: {} as Record<string, unknown>,
      remoteEntity: {} as Record<string, unknown>
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock returns
    (conflictManager.getConflictStats as ReturnType<typeof vi.fn>).mockReturnValue(mockStats);
    (conflictManager.getPendingConflicts as ReturnType<typeof vi.fn>).mockReturnValue(mockConflicts);
    (conflictManager.getResolutionHistory as ReturnType<typeof vi.fn>).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useConflictResolution());

      expect(result.current.conflicts).toEqual(mockConflicts);
      expect(result.current.stats).toEqual(mockStats);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.notifications).toEqual([]);
    });

    it('should filter conflicts by entity type', () => {
      const { result } = renderHook(() => 
        useConflictResolution({ entityType: 'show' })
      );
      console.log('Conflict resolution result:', result);

      expect(conflictManager.getPendingConflicts).toHaveBeenCalledWith('show');
    });

    it('should refresh conflicts when refreshConflicts is called', async () => {
      const { result } = renderHook(() => useConflictResolution());

      await act(async () => {
        result.current.refreshConflicts();
      });

      expect(conflictManager.getPendingConflicts).toHaveBeenCalled();
      expect(conflictManager.getResolutionHistory).toHaveBeenCalled();
      expect(conflictManager.getConflictStats).toHaveBeenCalled();
    });
  });

  describe('conflict resolution', () => {
    it('should resolve conflict manually', async () => {
      const mockResolution = {
        strategy: ResolutionStrategy.FIELD_MERGE,
        resolvedEntity: { id: 'test', name: 'resolved' } as Record<string, unknown>,
        automatic: false,
        resolvedBy: 'user-1'
      };

      (conflictManager.resolveConflictManually as ReturnType<typeof vi.fn>).mockResolvedValue(mockResolution);

      const { result } = renderHook(() => useConflictResolution());

      let resolution;
      await act(async () => {
        resolution = await result.current.resolveConflict(
          'conflict-1',
          ResolutionStrategy.FIELD_MERGE
        );
      });

      expect(resolution).toEqual(mockResolution);
      expect(conflictManager.resolveConflictManually).toHaveBeenCalledWith(
        'conflict-1',
        ResolutionStrategy.FIELD_MERGE,
        expect.objectContaining({
          userId: 'user-1',
          userRole: 'secretary',
          userPermissions: ['show_edit', 'entry_manage']
        }),
        undefined
      );
    });

    it('should resolve conflict with custom resolution', async () => {
      const customResolution = { name: 'Custom Name', status: 'custom' };
      const mockResolution = {
        strategy: ResolutionStrategy.CUSTOM_MERGE,
        resolvedEntity: customResolution as Record<string, unknown>,
        automatic: false,
        resolvedBy: 'user-1'
      };

      (conflictManager.resolveConflictManually as ReturnType<typeof vi.fn>).mockResolvedValue(mockResolution);

      const { result } = renderHook(() => useConflictResolution());

      await act(async () => {
        await result.current.resolveConflict(
          'conflict-1',
          ResolutionStrategy.CUSTOM_MERGE,
          customResolution
        );
      });

      expect(conflictManager.resolveConflictManually).toHaveBeenCalledWith(
        'conflict-1',
        ResolutionStrategy.CUSTOM_MERGE,
        expect.any(Object),
        customResolution
      );
    });

    it('should handle resolution errors', async () => {
      const error = new Error('Resolution failed');
      (conflictManager.resolveConflictManually as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { result } = renderHook(() => useConflictResolution());

      await act(async () => {
        try {
          await result.current.resolveConflict('conflict-1', ResolutionStrategy.LAST_WRITE_WINS);
        } catch (e) {
          expect(e).toBe(error);
        }
      });

      expect(result.current.error).toBe('Resolution failed');
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('sync conflict handling', () => {
    it('should handle sync conflicts', async () => {
      const localEntity: TestEntity = {
        id: 'test-1',
        name: 'Local Name',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false
      };

      const remoteEntity: TestEntity = {
        ...localEntity,
        name: 'Remote Name',
        _lastModified: '2024-01-01T11:30:00Z'
      };

      const mockResult = {
        hasConflict: true,
        resolvedEntity: remoteEntity,
        requiresManualResolution: false
      };

      (conflictManager.handleSyncConflict as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { result } = renderHook(() => useConflictResolution());

      let syncResult;
      await act(async () => {
        syncResult = await result.current.handleSyncConflict(localEntity, remoteEntity);
      });

      expect(syncResult).toEqual(mockResult);
      expect(conflictManager.handleSyncConflict).toHaveBeenCalledWith(
        localEntity,
        remoteEntity,
        undefined,
        expect.objectContaining({
          userId: 'user-1',
          userRole: 'secretary'
        })
      );
    });
  });

  describe('notifications', () => {
    it('should manage notifications', () => {
      const { result } = renderHook(() => useConflictResolution());

      // Start with empty notifications
      expect(result.current.notifications).toEqual([]);

      // Test dismissing a notification (would be populated by events in real usage)
      act(() => {
        result.current.dismissNotification('conflict-1');
      });

      // Test clearing all notifications
      act(() => {
        result.current.clearNotifications();
      });

      expect(result.current.notifications).toEqual([]);
    });
  });

  describe('event handling', () => {
    it('should subscribe to conflict events on mount', () => {
      renderHook(() => useConflictResolution({ enableNotifications: true }));

      expect(conflictManager.addEventListener).toHaveBeenCalledWith(
        'conflict_detected',
        expect.any(Function)
      );
      expect(conflictManager.addEventListener).toHaveBeenCalledWith(
        'conflict_resolved',
        expect.any(Function)
      );
      expect(conflictManager.addEventListener).toHaveBeenCalledWith(
        'conflict_failed',
        expect.any(Function)
      );
      expect(conflictManager.addEventListener).toHaveBeenCalledWith(
        'manual_resolution_required',
        expect.any(Function)
      );
    });

    it('should unsubscribe from events on unmount', () => {
      const { unmount } = renderHook(() => 
        useConflictResolution({ enableNotifications: true })
      );

      unmount();

      expect(conflictManager.removeEventListener).toHaveBeenCalledWith(
        'conflict_detected',
        expect.any(Function)
      );
      expect(conflictManager.removeEventListener).toHaveBeenCalledWith(
        'conflict_resolved',
        expect.any(Function)
      );
    });
  });

  describe('auto-refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should auto-refresh when enabled', () => {
      renderHook(() => 
        useConflictResolution({ 
          autoRefresh: true, 
          refreshInterval: 5000 
        })
      );

      // Clear initial calls
      vi.clearAllMocks();

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(conflictManager.getPendingConflicts).toHaveBeenCalled();
    });

    it('should not auto-refresh when disabled', () => {
      renderHook(() => 
        useConflictResolution({ 
          autoRefresh: false 
        })
      );

      // Clear initial calls
      vi.clearAllMocks();

      // Fast-forward time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(conflictManager.getPendingConflicts).not.toHaveBeenCalled();
    });
  });
});

describe('useShowConflictResolution', () => {
  it('should use show-specific configuration', () => {
    const { result } = renderHook(() => useShowConflictResolution());

    expect(conflictManager.getPendingConflicts).toHaveBeenCalledWith('show');
    expect(result.current.conflicts).toBeDefined();
  });
});

describe('useFormConflictResolution', () => {
  const currentEntity: TestEntity = {
    id: 'test-1',
    name: 'Original Name',
    status: 'draft',
    _version: 1,
    _lastModified: '2024-01-01T10:00:00Z',
    _syncStatus: 'synced',
    _deleted: false
  };

  it('should check for conflicts in form context', async () => {
    const updatedEntity: TestEntity = {
      ...currentEntity,
      name: 'Updated Name',
      _version: 2,
      _lastModified: '2024-01-01T11:00:00Z'
    };

    const remoteEntity: TestEntity = {
      ...currentEntity,
      status: 'published',
      _version: 2,
      _lastModified: '2024-01-01T11:30:00Z'
    };

    const mockResult = {
      hasConflict: true,
      conflict: mockConflicts[0],
      requiresManualResolution: true
    };

    (conflictManager.handleSyncConflict as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

    const { result } = renderHook(() => 
      useFormConflictResolution('show', currentEntity)
    );

    let checkResult;
    await act(async () => {
      checkResult = await result.current.checkForConflicts(updatedEntity, remoteEntity);
    });

    expect(checkResult).toEqual(mockResult);
    expect(result.current.conflictResolution).toEqual(mockResult);
  });

  it('should resolve form conflicts', async () => {
    const { result } = renderHook(() => 
      useFormConflictResolution('show', currentEntity)
    );

    // First set up a conflict resolution state
    act(() => {
      (result.current as Record<string, unknown>).setConflictResolution({
        hasConflict: true,
        conflict: mockConflicts[0],
        requiresManualResolution: true
      });
    });

    const mockResolution = {
      strategy: ResolutionStrategy.FIELD_MERGE,
      resolvedEntity: currentEntity,
      automatic: false
    };

    (conflictManager.resolveConflictManually as jest.Mock).mockResolvedValue(mockResolution);

    let resolution;
    await act(async () => {
      // Manually set conflict resolution for test
      (result.current as Record<string, unknown>).conflictResolution = {
        hasConflict: true,
        conflict: mockConflicts[0],
        requiresManualResolution: true
      };
      
      resolution = await result.current.resolveFormConflict(
        ResolutionStrategy.FIELD_MERGE
      );
    });

    expect(resolution).toEqual(mockResolution);
  });

  it('should clear conflict resolution', () => {
    const { result } = renderHook(() => 
      useFormConflictResolution('show', currentEntity)
    );

    act(() => {
      result.current.clearConflictResolution();
    });

    expect(result.current.conflictResolution).toBeNull();
  });
});