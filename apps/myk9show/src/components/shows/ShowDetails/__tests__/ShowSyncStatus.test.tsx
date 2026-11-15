import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSyncNote } from '../ShowSyncStatus';

const mocks = vi.hoisted(() => ({
  sync: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' | 'conflict',
    queueSize: 0,
    unsentScoreCount: 0,
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
    mocks.sync.queueSize = 0;
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'Offline · scores saved on this device',
      needsAttention: false,
      unsentScoreCount: 0,
    });

    mocks.sync.queueSize = 3;
    expect(renderHook(() => useSyncNote()).result.current.label).toBe(
      'Offline · 3 changes saved on this device'
    );

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
      label: 'Some changes need attention',
      needsAttention: true,
      unsentScoreCount: 0,
    });

    mocks.sync.status = 'synced';
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'All changes saved',
      needsAttention: false,
      unsentScoreCount: 0,
    });
  });

  // MYK9-2011: counted in scores, waiting or refused, and never "All changes saved" while one is.
  it('counts unsent scores in scores, refused ones included', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    mocks.sync.queueSize = 3;
    mocks.sync.unsentScoreCount = 1;
    expect(renderHook(() => useSyncNote()).result.current.label).toBe(
      'Offline · 1 score not sent yet'
    );

    // A refused score: the queue is empty, the failed store is not.
    mocks.sync.status = 'error';
    mocks.sync.isOnline = true;
    mocks.sync.queueSize = 0;
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: '1 score not sent yet',
      needsAttention: true,
      unsentScoreCount: 1,
    });

    mocks.sync.unsentScoreCount = 4;
    expect(renderHook(() => useSyncNote()).result.current.label).toBe('4 scores not sent yet');
    mocks.sync.unsentScoreCount = 0;
  });
});
