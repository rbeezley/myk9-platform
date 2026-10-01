import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClassEditActions } from '../useClassEditActions';
import { useTrialStore } from '@/store/trialStore';
import type { SyncableTrialClass } from '@/store/trial-store-types';

// MYK9-900: Setup's rows come from trialStore.trialClasses, not React Query. After a successful
// delete the class must leave the store immediately, not after the ~60s background sync.

const replicatedDelete = vi.hoisted(() => vi.fn());
const replicatedSync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/services/database/judges', () => ({ upsertClassJudgeAssignment: vi.fn() }));
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClassesTable: {
      ...actual.replicatedClassesTable,
      delete: replicatedDelete,
      sync: replicatedSync,
    },
  };
});

const cls = (id: string): SyncableTrialClass => ({
  id,
  element: 'Containers',
  level: 'Novice',
  section: 'A',
  judgeId: 'j1',
  startTime: '2026-05-09T09:00:00',
  status: 'Upcoming',
  entries: 0,
  _version: 1,
  _lastModified: new Date('2026-05-01T00:00:00Z'),
  _lastModifiedBy: 'u1',
  _syncStatus: 'synced',
});

describe('useClassEditActions store refresh', () => {
  beforeEach(() => {
    replicatedDelete.mockReset().mockResolvedValue(undefined);
    replicatedSync.mockReset().mockResolvedValue(undefined);
    // The reload from the (stale) replica still returns the deleted class, as it would before
    // background sync; the row must be gone anyway.
    useTrialStore.setState({
      trialClasses: { t1: [cls('c1'), cls('c2')] },
      loadTrialClasses: async () => undefined,
    });
  });

  it('removes the deleted class from the store as soon as the delete resolves', async () => {
    const deleteClass = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useClassEditActions({ showId: 's1', updateClass: vi.fn(), deleteClass })
    );

    await result.current.removeClass('c1');

    expect(deleteClass).toHaveBeenCalledWith('c1');
    expect(replicatedDelete).toHaveBeenCalledWith('c1');
    expect(useTrialStore.getState().trialClasses.t1.map(c => c.id)).toEqual(['c2']);
  });

  it('leaves the store untouched when the delete fails', async () => {
    const deleteClass = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useClassEditActions({ showId: 's1', updateClass: vi.fn(), deleteClass })
    );

    await expect(result.current.removeClass('c1')).rejects.toThrow('boom');

    expect(useTrialStore.getState().trialClasses.t1.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('refreshes the replica and the store after a successful save', async () => {
    const loadTrialClasses = vi.fn().mockResolvedValue(undefined);
    useTrialStore.setState({ loadTrialClasses });
    const { result } = renderHook(() =>
      useClassEditActions({
        showId: 's1',
        updateClass: vi.fn().mockResolvedValue(undefined),
        deleteClass: vi.fn(),
      })
    );

    await result.current.saveClass('c1', { id: 'c1' } as never, 't1');

    expect(replicatedSync).toHaveBeenCalled();
    expect(loadTrialClasses).toHaveBeenCalled();
  });
});
