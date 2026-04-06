import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunOrderDrag } from '../useRunOrderDrag';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

function makeEntry(id: string, runOrder: number | null): RawEntryRow {
  return {
    id,
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband: null,
    handler: null,
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    total_faults: null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
    check_in_status: null,
    run_order: runOrder,
    dog: null,
    created_at: null,
    updated_at: null,
  };
}

describe('useRunOrderDrag', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore default implementation after tests that override it
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('initializes orderedIds from run_order ascending', () => {
    const entries = [makeEntry('e3', 3), makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));
    expect(result.current.orderedIds).toEqual(['e1', 'e2', 'e3']);
  });

  it('sorts null run_order entries last', () => {
    const entries = [makeEntry('eA', null), makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));
    expect(result.current.orderedIds[2]).toBe('eA');
  });

  it('writes all positions after drag', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));

    await act(async () => {
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e3' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    // New order: e2, e3, e1 → all 3 positions written
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(3);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e2', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e3', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e1', { runOrder: 3 });
  });

  it('rolls back and shows error when all writes fail', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { notifications } = await import('@/lib/notifications');
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network error')
    );

    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));
    const originalOrder = [...result.current.orderedIds];

    await act(async () => {
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e2' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    expect(result.current.orderedIds).toEqual(originalOrder);
    expect(notifications.error).toHaveBeenCalledWith('Failed to save run order');
  });

  it('rolls back and shows error on partial failure', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    const { notifications } = await import('@/lib/notifications');
    let call = 0;
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      // First call succeeds, second fails — partial failure must trigger rollback
      return call === 1 ? Promise.resolve(undefined) : Promise.reject(new Error('write failed'));
    });

    const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));
    const originalOrder = [...result.current.orderedIds];

    await act(async () => {
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e3' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    expect(result.current.orderedIds).toEqual(originalOrder);
    expect(notifications.error).toHaveBeenCalledWith('Failed to save run order');
  });

  it('blocks a second drag while persistence is in-flight', async () => {
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    let resolveFirst!: () => void;
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<void>(res => {
          resolveFirst = res;
        })
    );

    const entries = [makeEntry('e1', 1), makeEntry('e2', 2), makeEntry('e3', 3)];
    const { result } = renderHook(() => useRunOrderDrag({ rawEntries: entries }));

    // Start first drag (in-flight)
    act(() => {
      result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e3' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    const orderAfterFirstDrag = [...result.current.orderedIds]; // ['e2', 'e3', 'e1']

    // Second drag fires while first is still in-flight — must be ignored
    await act(async () => {
      await result.current.onDragEnd({
        active: { id: 'e2' },
        over: { id: 'e3' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    // Order should not have changed from first drag
    expect(result.current.orderedIds).toEqual(orderAfterFirstDrag);

    await act(async () => {
      resolveFirst();
    });
  });

  it('drag override keeps order stable while persistence is in-flight against a conflicting server push', async () => {
    let resolveUpdate!: () => void;
    const { replicatedEntriesTable } =
      await import('@/services/replication/ReplicatedEntriesTable');
    (replicatedEntriesTable.updateEntry as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>(res => {
          resolveUpdate = res;
        })
    );

    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result, rerender } = renderHook(({ rawEntries }) => useRunOrderDrag({ rawEntries }), {
      initialProps: { rawEntries: entries },
    });

    // Start a drag — override is set optimistically to ['e2', 'e1']
    act(() => {
      result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e2' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    const orderAfterDrag = [...result.current.orderedIds]; // ['e2', 'e1']

    // Server pushes the OLD order back while persistence is still in-flight
    rerender({ rawEntries: [makeEntry('e1', 1), makeEntry('e2', 2)] });

    // dragOverride is still set → displayed order unchanged (override wins)
    expect(result.current.orderedIds).toEqual(orderAfterDrag);

    // Let persistence complete
    await act(async () => {
      resolveUpdate();
    });
  });

  it('re-syncs to server order after successful drag when rawEntries reflects new order', async () => {
    const entries = [makeEntry('e1', 1), makeEntry('e2', 2)];
    const { result, rerender } = renderHook(({ rawEntries }) => useRunOrderDrag({ rawEntries }), {
      initialProps: { rawEntries: entries },
    });

    await act(async () => {
      await result.current.onDragEnd({
        active: { id: 'e1' },
        over: { id: 'e2' },
      } as Parameters<typeof result.current.onDragEnd>[0]);
    });

    // After success, dragOverride persists until rawEntries confirms the new order.
    // Simulate rawEntries updating to reflect the written order.
    rerender({ rawEntries: [makeEntry('e2', 1), makeEntry('e1', 2)] });
    expect(result.current.orderedIds).toEqual(['e2', 'e1']);
  });
});
