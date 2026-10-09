import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncTable, notifyError } = vi.hoisted(() => ({
  syncTable: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('@/hooks/useOptionalReplicationSync', () => ({
  useOptionalReplicationSync: () => ({ syncTable }),
}));
vi.mock('@/lib/notifications', () => ({ notifications: { error: notifyError } }));

import { useEnsureReplicaWarm, useReplicaRowForEdit } from '@/hooks/useReplicaRowForEdit';

describe('useReplicaRowForEdit (MYK9-1067 rule, generalised in MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a warm row is returned without a sync', async () => {
    const lookup = vi.fn().mockResolvedValue({ id: 'r1' });
    const { result } = renderHook(() =>
      useReplicaRowForEdit({ tableName: 'people', lookup, missingMessage: 'missing' })
    );
    expect(await result.current('r1')).toEqual({ id: 'r1' });
    expect(syncTable).not.toHaveBeenCalled();
  });

  it('a cold row runs the table sync and looks again (no single-row hydration)', async () => {
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'r1' });
    const { result } = renderHook(() =>
      useReplicaRowForEdit({ tableName: 'people', lookup, missingMessage: 'missing' })
    );
    expect(await result.current('r1')).toEqual({ id: 'r1' });
    expect(syncTable).toHaveBeenCalledWith('people');
  });

  it('still missing: notifies by default, stays quiet in silent mode', async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const loud = renderHook(() =>
      useReplicaRowForEdit({ tableName: 'people', lookup, missingMessage: 'missing' })
    );
    expect(await loud.result.current('r1')).toBeNull();
    expect(notifyError).toHaveBeenCalledWith('missing');

    notifyError.mockClear();
    const quiet = renderHook(() =>
      useReplicaRowForEdit({
        tableName: 'people',
        lookup,
        missingMessage: 'missing',
        onMissing: 'silent',
      })
    );
    expect(await quiet.result.current('r1')).toBeNull();
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe('useEnsureReplicaWarm (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs a cold table once and reports whether it warmed', async () => {
    const isCold = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useEnsureReplicaWarm('dog_registrations', isCold));
    expect(await result.current()).toBe(true);
    expect(syncTable).toHaveBeenCalledWith('dog_registrations');
  });

  it('reports false when the table is still cold (offline first use)', async () => {
    const isCold = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useEnsureReplicaWarm('dog_registrations', isCold));
    expect(await result.current()).toBe(false);
  });
});
