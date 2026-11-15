import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSyncNote } from '../ShowSyncStatus';

const mocks = vi.hoisted(() => ({
  sync: {
    status: 'synced' as 'synced' | 'pending' | 'offline' | 'error' | 'conflict',
    queueSize: 0,
    unsentScoreCount: 0,
    otherChangeCount: 0,
    refusedCount: 0,
    isOnline: true,
    conflictCount: 0,
    errorCount: 0,
  },
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => mocks.sync,
}));

function setUnsent(scores: number, others: number, refused = 0) {
  mocks.sync.unsentScoreCount = scores;
  mocks.sync.otherChangeCount = others;
  mocks.sync.refusedCount = refused;
  mocks.sync.queueSize = scores + others;
}

const label = () => renderHook(() => useSyncNote()).result.current.label;

describe('useSyncNote', () => {
  beforeEach(() => {
    mocks.sync.status = 'synced';
    mocks.sync.isOnline = true;
    setUnsent(0, 0);
  });

  it('uses calm, truthful offline and pending-save wording', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'Offline · scores saved on this device',
      needsAttention: false,
      unsentScoreCount: 0,
    });

    setUnsent(0, 3);
    expect(label()).toBe('Offline · 3 changes saved on this device');

    mocks.sync.status = 'pending';
    mocks.sync.isOnline = true;
    setUnsent(0, 2);
    expect(label()).toBe('2 changes saved on this device');

    setUnsent(0, 1);
    expect(label()).toBe('1 change saved on this device');

    mocks.sync.status = 'conflict';
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'Some changes need attention',
      needsAttention: true,
      unsentScoreCount: 0,
    });

    mocks.sync.status = 'synced';
    setUnsent(0, 0);
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: 'All changes saved',
      needsAttention: false,
      unsentScoreCount: 0,
    });
  });

  // MYK9-2011: the count is in scores, and a refused score is still counted.
  it('counts one dog scored as one score, offline and online', () => {
    mocks.sync.status = 'offline';
    mocks.sync.isOnline = false;
    setUnsent(1, 0);
    expect(label()).toBe('Offline · 1 score not sent yet');

    mocks.sync.status = 'pending';
    mocks.sync.isOnline = true;
    setUnsent(2, 1);
    expect(label()).toBe('2 scores and 1 other change not sent yet');
  });

  it('never says all changes are saved while a refused score is on the device', () => {
    mocks.sync.status = 'pending';
    setUnsent(1, 0, 1);
    expect(renderHook(() => useSyncNote()).result.current).toEqual({
      label: '1 score not sent yet',
      needsAttention: true,
      unsentScoreCount: 1,
    });
  });

  it('flags a refused change that is not a score as needing attention', () => {
    mocks.sync.status = 'pending';
    setUnsent(0, 1, 1);
    expect(renderHook(() => useSyncNote()).result.current).toMatchObject({
      label: 'Some changes need attention',
      needsAttention: true,
    });
  });
});
