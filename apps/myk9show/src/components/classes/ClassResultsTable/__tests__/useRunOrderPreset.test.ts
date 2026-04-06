import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRunOrderPreset } from '../useRunOrderPreset';
import { notifications } from '@/lib/notifications';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';

const { mockUpdateEntry, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUpdateEntry: vi.fn().mockResolvedValue(undefined),
  mockInvalidateQueries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { updateEntry: mockUpdateEntry },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...(actual as object),
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
  };
});

function makeEntry(id: string, armband: string): RawEntryRow {
  return {
    id,
    class_id: 'c1',
    show_id: 's1',
    dog_id: 'd1',
    handler_id: null,
    armband,
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
    run_order: 1,
    dog: null,
    created_at: null,
    updated_at: null,
  };
}

const entries = [makeEntry('e1', '3'), makeEntry('e2', '1'), makeEntry('e3', '2')];

describe('useRunOrderPreset', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateEntry.mockResolvedValue(undefined);
  });

  it('calls updateEntry for each entry with the correct runOrder value', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockUpdateEntry).toHaveBeenCalledTimes(3);
    expect(mockUpdateEntry).toHaveBeenCalledWith('e2', { runOrder: 1 });
    expect(mockUpdateEntry).toHaveBeenCalledWith('e3', { runOrder: 2 });
    expect(mockUpdateEntry).toHaveBeenCalledWith('e1', { runOrder: 3 });
  });

  it('shows error toast and re-throws when any updateEntry call fails', async () => {
    mockUpdateEntry
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    let threw = false;
    try {
      await act(() => result.current.applyPreset('armband-asc'));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(notifications.error).toHaveBeenCalledWith('Failed to set run order');
  });

  it('invalidates the class entries query key on success', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['classes', 'c1', 'entries'],
    });
  });

  it('isApplying is false after successful apply', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(result.current.isApplying).toBe(false);
  });

  it('calls notifications.error and re-throws on updateEntry failure', async () => {
    mockUpdateEntry.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    let threw = false;
    try {
      await act(() => result.current.applyPreset('armband-asc'));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(notifications.error).toHaveBeenCalledWith('Failed to set run order');
  });

  it('isApplying is false after a failure', async () => {
    mockUpdateEntry.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    try {
      await act(() => result.current.applyPreset('armband-asc'));
    } catch {
      // expected
    }
    expect(result.current.isApplying).toBe(false);
  });

  it('does not call updateEntry when classId is undefined', async () => {
    const { result } = renderHook(() => useRunOrderPreset(undefined, entries));
    await act(() => result.current.applyPreset('armband-asc'));
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('does not call updateEntry for manual preset', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('manual'));
    expect(mockUpdateEntry).not.toHaveBeenCalled();
  });

  it('does not invalidate query for manual preset', async () => {
    const { result } = renderHook(() => useRunOrderPreset('c1', entries));
    await act(() => result.current.applyPreset('manual'));
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
