import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { CLASS_STATUS } from '@myk9/core';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const deleteMutateAsyncMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useClassesDatabase', () => ({
  useDeleteClassMutation: () => ({ mutateAsync: deleteMutateAsyncMock }),
  classKeys: { all: ['classes'] as const },
}));

const invalidateQueriesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@tanstack/react-query', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
  };
});

const applyManualClassStatusMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: applyManualClassStatusMock,
}));

import { toast } from 'sonner';
import { useClassBulkActions } from '../useClassBulkActions';
import type { ClassActionItem } from '../classActions';

/** Pulls the `{ label, onClick }` retry action out of a mocked toast.error() call. */
function retryActionFromCall(callIndex = 0): { label: string; onClick: () => void } {
  const call = vi.mocked(toast.error).mock.calls[callIndex];
  const options = call?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
  const action = options?.action;
  if (!action) throw new Error('toast.error was not called with a retry action');
  return action;
}

function classesById(items: ClassActionItem[]): Map<string, ClassActionItem> {
  return new Map(items.map(item => [item.id, item]));
}

describe('useClassBulkActions — bulk status change (MYK9-59)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches applyManualClassStatus for every class id', async () => {
    applyManualClassStatusMock.mockResolvedValue(undefined);
    const items: ClassActionItem[] = [
      { id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED },
      { id: 'c2', name: 'B', status: CLASS_STATUS.SCHEDULED },
    ];
    const { result } = renderHook(() => useClassBulkActions({ classesById: classesById(items) }));

    await act(async () => {
      await result.current.handleBulkStatusChange(['c1', 'c2'], CLASS_STATUS.IN_PROGRESS);
    });

    expect(applyManualClassStatusMock).toHaveBeenCalledWith('c1', CLASS_STATUS.IN_PROGRESS);
    expect(applyManualClassStatusMock).toHaveBeenCalledWith('c2', CLASS_STATUS.IN_PROGRESS);
  });

  it('invalidates the classes cache family per succeeded item, including on partial success', async () => {
    applyManualClassStatusMock.mockImplementation(async (id: string) => {
      if (id === 'c2') throw new Error('boom');
    });
    const items: ClassActionItem[] = [
      { id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED },
      { id: 'c2', name: 'B', status: CLASS_STATUS.SCHEDULED },
    ];
    const { result } = renderHook(() => useClassBulkActions({ classesById: classesById(items) }));

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.handleBulkStatusChange(['c1', 'c2'], CLASS_STATUS.IN_PROGRESS);
    });

    // Partial failure: handler reports not-fully-done (selection retained by the
    // caller), but the succeeded class DID change — the list must still refresh.
    expect(outcome).toBe(false);
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
    // Whole classKeys family (prefix covers lists, detail, byTrial, statistics).
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['classes'] });
  });

  it('retry skips a class whose fresh status no longer matches its status at first dispatch', async () => {
    let currentStatus: string = CLASS_STATUS.SCHEDULED;
    const items: ClassActionItem[] = [
      { id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED },
      { id: 'c2', name: 'B', status: CLASS_STATUS.SCHEDULED },
    ];
    // classesById is a live view the caller keeps current — model that with a
    // getter so a status flip after dispatch is visible to the retry's
    // applicableWhen without re-rendering the hook.
    const byId = classesById(items);
    Object.defineProperty(byId.get('c1'), 'status', {
      get: () => currentStatus,
      configurable: true,
    });

    applyManualClassStatusMock.mockImplementation(async (id: string) => {
      if (id === 'c1') throw new Error('network error');
    });

    const { result } = renderHook(() => useClassBulkActions({ classesById: byId }));

    await act(async () => {
      await result.current.handleBulkStatusChange(['c1', 'c2'], CLASS_STATUS.IN_PROGRESS);
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    applyManualClassStatusMock.mockClear();
    applyManualClassStatusMock.mockResolvedValue(undefined);

    // Another actor moves c1's status before the retry — it's no longer
    // "Scheduled" (its status at first dispatch), so retry must skip it.
    currentStatus = CLASS_STATUS.CANCELLED;

    await act(async () => {
      retryActionFromCall().onClick();
      await waitFor(() => expect(applyManualClassStatusMock).not.toHaveBeenCalledWith('c1', expect.anything()));
    });

    expect(applyManualClassStatusMock).not.toHaveBeenCalledWith('c1', CLASS_STATUS.IN_PROGRESS);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('no longer eligible'));
  });

  it('invokes onFullSuccess when a toast retry finally succeeds (selection clear path)', async () => {
    const items: ClassActionItem[] = [
      { id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED },
      { id: 'c2', name: 'B', status: CLASS_STATUS.SCHEDULED },
    ];
    applyManualClassStatusMock.mockImplementation(async (id: string) => {
      if (id === 'c1') throw new Error('network error');
    });
    const onFullSuccess = vi.fn();
    const { result } = renderHook(() => useClassBulkActions({ classesById: classesById(items) }));

    await act(async () => {
      await result.current.handleBulkStatusChange(
        ['c1', 'c2'],
        CLASS_STATUS.IN_PROGRESS,
        onFullSuccess
      );
    });
    expect(onFullSuccess).not.toHaveBeenCalled();

    applyManualClassStatusMock.mockResolvedValue(undefined);
    await act(async () => {
      retryActionFromCall().onClick();
      await waitFor(() => expect(onFullSuccess).toHaveBeenCalledTimes(1));
    });
  });

  it('retry reads the LATEST classesById after a rerender, not the dispatch-time closure', async () => {
    // The realistic flow: React Query refetches, the page re-renders the hook
    // with a brand-new Map. A closure over the old prop would still compare
    // snapshot-to-snapshot (always equal) and overwrite the concurrent change;
    // the ref must surface the new map to the retry's applicableWhen.
    const initialItems: ClassActionItem[] = [
      { id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED },
      { id: 'c2', name: 'B', status: CLASS_STATUS.SCHEDULED },
    ];
    applyManualClassStatusMock.mockImplementation(async (id: string) => {
      if (id === 'c1') throw new Error('network error');
    });

    const { result, rerender } = renderHook(
      ({ byId }: { byId: Map<string, ClassActionItem> }) =>
        useClassBulkActions({ classesById: byId }),
      { initialProps: { byId: classesById(initialItems) } }
    );

    await act(async () => {
      await result.current.handleBulkStatusChange(['c1', 'c2'], CLASS_STATUS.IN_PROGRESS);
    });
    expect(toast.error).toHaveBeenCalledTimes(1);

    // Fresh data arrives: another actor cancelled c1. New Map instance, new render.
    rerender({
      byId: classesById([
        { id: 'c1', name: 'A', status: CLASS_STATUS.CANCELLED },
        { id: 'c2', name: 'B', status: CLASS_STATUS.IN_PROGRESS },
      ]),
    });

    applyManualClassStatusMock.mockClear();
    applyManualClassStatusMock.mockResolvedValue(undefined);

    await act(async () => {
      retryActionFromCall().onClick();
      await waitFor(() =>
        expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('no longer eligible'))
      );
    });

    expect(applyManualClassStatusMock).not.toHaveBeenCalled();
  });

  it('returns false on a latched duplicate dispatch (in-flight) without clearing the caller-owned selection', async () => {
    let resolveFirst: (() => void) | undefined;
    applyManualClassStatusMock.mockImplementation(
      () => new Promise<void>(resolve => (resolveFirst = resolve))
    );
    const items: ClassActionItem[] = [{ id: 'c1', name: 'A', status: CLASS_STATUS.SCHEDULED }];
    const { result } = renderHook(() => useClassBulkActions({ classesById: classesById(items) }));

    let firstRun!: Promise<boolean>;
    act(() => {
      firstRun = result.current.handleBulkStatusChange(['c1'], CLASS_STATUS.IN_PROGRESS);
    });

    let secondResult: boolean | undefined;
    await act(async () => {
      secondResult = await result.current.handleBulkStatusChange(['c1'], CLASS_STATUS.IN_PROGRESS);
    });

    expect(secondResult).toBe(false);
    expect(applyManualClassStatusMock).toHaveBeenCalledTimes(1);

    resolveFirst?.();
    await act(async () => {
      await firstRun;
    });
  });
});
