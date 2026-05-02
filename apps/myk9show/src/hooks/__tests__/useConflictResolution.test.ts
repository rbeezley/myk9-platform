import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// vi.hoisted ensures these are available when vi.mock factories run
const { registeredHandlers, mockManager, mockUseAuth } = vi.hoisted(() => {
  const registeredHandlers: Map<string, (event: unknown) => void> = new Map();

  const mockManager = {
    getPendingConflicts: vi.fn().mockReturnValue([]),
    getResolutionHistory: vi.fn().mockReturnValue([]),
    getConflictStats: vi.fn().mockReturnValue({ total: 0, pending: 0, resolved: 0 }),
    addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => {
      registeredHandlers.set(type, handler);
    }),
    removeEventListener: vi.fn((type: string) => {
      registeredHandlers.delete(type);
    }),
    resolveConflictManually: vi.fn().mockResolvedValue(undefined),
    handleSyncConflict: vi.fn(),
  };

  const mockUseAuth = vi.fn().mockReturnValue({ user: { id: 'user-123' } });

  return { registeredHandlers, mockManager, mockUseAuth };
});

vi.mock('@myk9/replication', () => ({ conflictManager: mockManager }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));

beforeEach(() => {
  vi.clearAllMocks();
  registeredHandlers.clear();
  mockManager.getPendingConflicts.mockReturnValue([]);
  mockManager.getResolutionHistory.mockReturnValue([]);
  mockManager.getConflictStats.mockReturnValue({ total: 0, pending: 0, resolved: 0 });
  mockManager.resolveConflictManually.mockResolvedValue(undefined);
  // Re-wire addEventListener/removeEventListener after clearAllMocks resets them
  mockManager.addEventListener.mockImplementation(
    (type: string, handler: (event: unknown) => void) => {
      registeredHandlers.set(type, handler);
    }
  );
  mockManager.removeEventListener.mockImplementation((type: string) => {
    registeredHandlers.delete(type);
  });
  mockUseAuth.mockReturnValue({ user: { id: 'user-123' } });
});

// Minimal Conflict shape for test fixtures
function makeReplicationConflict(id: string, entityType = 'show') {
  return {
    id,
    entityId: `entity-${id}`,
    entityType,
    localData: {},
    remoteData: {},
    detectedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'pending' as const,
  };
}

import { useConflictResolution } from '../useConflictResolution';

describe('useConflictResolution', () => {
  it('calls getPendingConflicts, getResolutionHistory, getConflictStats on mount', () => {
    renderHook(() => useConflictResolution());
    expect(mockManager.getPendingConflicts).toHaveBeenCalled();
    expect(mockManager.getResolutionHistory).toHaveBeenCalled();
    expect(mockManager.getConflictStats).toHaveBeenCalled();
  });

  it('filters conflicts by entityType when option is provided', () => {
    mockManager.getPendingConflicts.mockReturnValue([
      makeReplicationConflict('c1', 'show'),
      makeReplicationConflict('c2', 'dog'),
    ]);
    const { result } = renderHook(() => useConflictResolution({ entityType: 'show' }));
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].entityType).toBe('show');
  });

  it('adds a notification when conflict_detected fires with enableNotifications: true', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));
    const callsBefore = mockManager.getPendingConflicts.mock.calls.length;

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('notification-c1');
    expect(result.current.notifications[0].type).toBe('warning');
    // confirm refreshConflicts ran
    expect(mockManager.getPendingConflicts.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('adds an error notification when manual_resolution_required fires', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('manual_resolution_required')?.({
        conflictId: 'c3',
        entityType: 'dog',
        entityId: 'e3',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('notification-c3');
    expect(result.current.notifications[0].type).toBe('error');
  });

  it('does not add a notification when enableNotifications is false', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: false }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c2',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('calls removeEventListener for all 4 event types on unmount', () => {
    const { unmount } = renderHook(() => useConflictResolution());
    unmount();
    expect(mockManager.removeEventListener).toHaveBeenCalledTimes(4);
  });

  it('dismissNotification removes the correct notification and leaves others', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c2',
        entityType: 'dog',
        entityId: 'e2',
      });
    });
    expect(result.current.notifications).toHaveLength(2);

    act(() => result.current.dismissNotification('c1'));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe('notification-c2');
  });

  it('clearNotifications removes all notifications', () => {
    const { result } = renderHook(() => useConflictResolution({ enableNotifications: true }));

    act(() => {
      registeredHandlers.get('conflict_detected')?.({
        conflictId: 'c1',
        entityType: 'show',
        entityId: 'e1',
      });
    });

    act(() => result.current.clearNotifications());
    expect(result.current.notifications).toHaveLength(0);
  });

  it('resolveConflict calls resolveConflictManually with the correct ConflictStrategy', async () => {
    const { result } = renderHook(() => useConflictResolution());

    await act(async () => {
      await result.current.resolveConflict('c1', 'local_wins');
    });

    expect(mockManager.resolveConflictManually).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        strategy: 'client-authoritative',
        userId: 'user-123',
      })
    );
  });

  it('resolveConflict throws before calling manager when user is null', async () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useConflictResolution());

    await expect(
      act(async () => {
        await result.current.resolveConflict('c1', 'local_wins');
      })
    ).rejects.toThrow('User must be authenticated');

    expect(mockManager.resolveConflictManually).not.toHaveBeenCalled();
  });

  it('sets error state when getPendingConflicts throws', () => {
    mockManager.getPendingConflicts.mockImplementation(() => {
      throw new Error('DB error');
    });
    const { result } = renderHook(() => useConflictResolution());
    expect(result.current.error).toBe('DB error');
    expect(result.current.isLoading).toBe(false);
  });
});
