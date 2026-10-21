import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSyncNote } from '../ShowSyncStatus';

const mocks = vi.hoisted(() => ({
  sync: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' | 'conflict',
    queueSize: 0,
    isOnline: true,
    conflictCount: 0,
    errorCount: 0,
  },
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => mocks.sync,
}));

describe('useSyncNote', () => {
  it('uses calm, truthful offline and pending-save wording', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'Changes saved on this device, will sync when online',
      needsAttention: false,
    });

    mocks.sync.status = 'pending';
    mocks.sync.isOnline = true;
    mocks.sync.queueSize = 2;
    expect(renderHook(() => useSyncNote()).result.current.label).toBe(
      '2 changes saved on this device'
    );

    mocks.sync.queueSize = 1;
    expect(renderHook(() => useSyncNote()).result.current.label).toBe(
      '1 change saved on this device'
    );

    mocks.sync.status = 'conflict';
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'Sync needs attention',
      needsAttention: true,
    });

    mocks.sync.status = 'synced';
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'All changes saved',
      needsAttention: false,
    });
  });
});
