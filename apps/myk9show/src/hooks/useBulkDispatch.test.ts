import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useBulkDispatch } from './useBulkDispatch';

interface Item {
  id: string;
  eligible: boolean;
}

function item(id: string, eligible = true): Item {
  return { id, eligible };
}

/** Pulls the `{ label, onClick }` retry action out of a mocked toast.error() call. */
function retryActionFromCall(callIndex = 0): { label: string; onClick: () => void } {
  const call = vi.mocked(toast.error).mock.calls[callIndex];
  const options = call?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
  const action = options?.action;
  if (!action) throw new Error('toast.error was not called with a retry action');
  return action;
}

describe('useBulkDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a success toast when every item succeeds', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run([item('a'), item('b')], async () => undefined);
    });

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a partial-failure toast with a retry action on partial failure', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run([item('a'), item('b')], async i => {
        if (i.id === 'b') throw new Error('boom');
      });
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(retryActionFromCall().label).toBe('Retry failed');
  });

  it('retry re-runs only the previously failed items', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const runItem = vi.fn(async (i: Item) => {
      if (i.id === 'b') throw new Error('boom');
    });

    await act(async () => {
      await result.current.run([item('a'), item('b')], runItem);
    });
    expect(runItem).toHaveBeenCalledTimes(2);

    const retry = retryActionFromCall();
    runItem.mockClear();
    // Second attempt succeeds for the retried item.
    runItem.mockImplementation(async () => undefined);

    await act(async () => {
      retry.onClick();
    });

    await waitFor(() => expect(runItem).toHaveBeenCalledTimes(1));
    expect(runItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('reports newly-ineligible retried items as skipped, not failed', async () => {
    const applicableWhen = vi.fn((i: Item) => i.eligible);
    const { result } = renderHook(() =>
      useBulkDispatch<Item>({ getLabel: i => i.id, applicableWhen })
    );
    const target = item('b', true);
    const runItem = vi.fn(async () => {
      throw new Error('boom');
    });

    await act(async () => {
      await result.current.run([target], runItem);
    });

    // Item becomes ineligible before retry runs.
    target.eligible = false;
    const retry = retryActionFromCall();
    runItem.mockClear();

    await act(async () => {
      retry.onClick();
    });

    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(runItem).not.toHaveBeenCalled();
  });

  it('attaches an Undo action to the full-success toast when buildUndo is provided', async () => {
    const onUndo = vi.fn();
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run([item('a'), item('b')], async () => undefined, {
        buildUndo: outcome => (outcome.succeeded.length > 0 ? onUndo : undefined),
      });
    });

    const options = vi.mocked(toast.success).mock.calls[0]?.[1] as
      { action?: { label: string; onClick: () => void } } | undefined;
    expect(options?.action?.label).toBe('Undo');
    options?.action?.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does NOT attach Undo to the partial-failure toast (retry keeps the action slot)', async () => {
    const onUndo = vi.fn();
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async i => {
          if (i.id === 'b') throw new Error('boom');
        },
        { buildUndo: () => onUndo }
      );
    });

    // Partial failure surfaces the retry action, never Undo.
    expect(retryActionFromCall().label).toBe('Retry failed');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('preserves Undo when a retry of the failed subset fully succeeds', async () => {
    const onUndo = vi.fn();
    const onFullSuccess = vi.fn();
    let attempt = 0;
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async i => {
          // 'b' fails the first time, succeeds on retry.
          if (i.id === 'b' && attempt++ === 0) throw new Error('boom');
        },
        {
          buildUndo: outcome => (outcome.succeeded.length > 0 ? onUndo : undefined),
          onFullSuccess,
        }
      );
    });

    // First pass partially failed → retry action, no success toast yet.
    const retry = retryActionFromCall();
    await act(async () => {
      retry.onClick();
    });

    // The retry fully succeeded → success toast WITH an Undo for the retried item.
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onFullSuccess).toHaveBeenCalledTimes(1);
    const options = vi.mocked(toast.success).mock.calls[0]?.[1] as
      { action?: { label: string; onClick: () => void } } | undefined;
    expect(options?.action?.label).toBe('Undo');
    options?.action?.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('calls onFullSuccess for an initially successful batch', async () => {
    const onFullSuccess = vi.fn();
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run([item('a')], async () => undefined, { onFullSuccess });
    });

    expect(onFullSuccess).toHaveBeenCalledTimes(1);
  });

  it('ignores a second concurrent run while one is already in flight (useRef latch)', async () => {
    let resolveFirst!: () => void;
    const first = new Promise<void>(resolve => {
      resolveFirst = resolve;
    });
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    let firstOutcome: unknown;
    let secondOutcome: unknown;

    const runPromise = act(async () => {
      const p1 = result.current.run([item('a')], async () => {
        await first;
      });
      const p2 = result.current.run([item('b')], async () => undefined);
      resolveFirst();
      [firstOutcome, secondOutcome] = await Promise.all([p1, p2]);
    });
    await runPromise;

    expect((firstOutcome as { succeeded: Item[] }).succeeded).toHaveLength(1);
    // The overlapping call is dropped with a null outcome — distinguishable from a
    // real empty success, so callers don't treat the latched no-op as "all done"
    // (which would clear the live selection mid-batch).
    expect(secondOutcome).toBeNull();
  });
});
