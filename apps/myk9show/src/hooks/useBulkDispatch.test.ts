import { act, renderHook, waitFor } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    // Sonner returns the toast id; the partial-failure toast re-uses it so a
    // re-show replaces the same toast instead of stacking a second one.
    error: vi.fn(() => 'failure-toast'),
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

type RetryAction = { label: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void };

/** Pulls the `{ label, onClick }` retry action out of a mocked toast.error() call. */
function retryActionFromCall(callIndex = 0): RetryAction {
  const call = vi.mocked(toast.error).mock.calls[callIndex];
  const options = call?.[1] as { action?: RetryAction } | undefined;
  const action = options?.action;
  if (!action) throw new Error('toast.error was not called with a retry action');
  return action;
}

/**
 * Sonner hands the action button its click event and dismisses the toast unless
 * `defaultPrevented` — see useBulkDispatch.toaster.test.tsx, which exercises the
 * real component. Here the event is a stub so the call is well-formed and the
 * busy branch's preventDefault is observable.
 */
function mouseEvent(): MouseEvent<HTMLButtonElement> & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return { preventDefault: vi.fn() } as unknown as MouseEvent<HTMLButtonElement> & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
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
      retry.onClick(mouseEvent());
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
      retry.onClick(mouseEvent());
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
      retry.onClick(mouseEvent());
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

describe('useBulkDispatch claimFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // MYK9-584. This block previously asserted the OPPOSITE — that a fully
  // claimed batch shows no toast at all. That silence shipped in #2267 and
  // produced a bulk delete with no feedback of any kind in production: the
  // caller's dialog lived inside a component that the optimistic update
  // unmounted before it could render, so suppressing the toast removed the only
  // message that still reached the user.
  //
  // The rule now: claiming a failure may take it out of the DETAIL LINES and
  // the retry set, so the toast does not duplicate the caller's own UI. It may
  // never take away the toast. A report the caller can silence by accident is
  // worse than one that is occasionally redundant.
  it('still shows a toast when every failure is claimed and nothing succeeded', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async () => {
          throw new Error('blocked');
        },
        { claimFailure: () => true }
      );
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toContain('2 failed');
  });

  it('counts claimed failures honestly in the title', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a'), item('b'), item('c')],
        async i => {
          if (i.id !== 'a') throw new Error('blocked');
        },
        { claimFailure: () => true }
      );
    });

    // 1 of 3 succeeded, 2 failed — the count must not shrink just because the
    // caller is also reporting those two somewhere else.
    const title = vi.mocked(toast.error).mock.calls[0]?.[0] as string;
    expect(title).toContain('1 of 3');
    expect(title).toContain('2 failed');
  });

  it('omits claimed failures from the detail lines, so the toast does not duplicate the dialog', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async i => {
          throw new Error(i.id === 'a' ? 'blocked' : 'network down');
        },
        { claimFailure: (_i, error) => (error as Error).message === 'blocked' }
      );
    });

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as { description?: string };
    expect(options.description).toContain('network down');
    expect(options.description).not.toContain('blocked');
  });

  it('offers no retry action when every failure was claimed', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    await act(async () => {
      await result.current.run(
        [item('a')],
        async () => {
          throw new Error('blocked');
        },
        { claimFailure: () => true }
      );
    });

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as { action?: unknown };
    expect(options.action).toBeUndefined();
  });

  it('retries only the unclaimed subset', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const attempted: string[] = [];

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async i => {
          attempted.push(i.id);
          throw new Error(i.id === 'a' ? 'blocked' : 'network down');
        },
        { claimFailure: (_i, error) => (error as Error).message === 'blocked' }
      );
    });

    attempted.length = 0;
    await act(async () => {
      retryActionFromCall().onClick(mouseEvent());
    });

    await waitFor(() => expect(attempted).toEqual(['b']));
  });

  it('returns the full outcome so the caller can act on the claimed subset', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    let outcome: Awaited<ReturnType<typeof result.current.run>> = null;
    await act(async () => {
      outcome = await result.current.run(
        [item('a'), item('b')],
        async i => {
          if (i.id === 'b') throw new Error('blocked');
        },
        { claimFailure: () => true }
      );
    });

    expect(outcome!.failed).toHaveLength(1);
    expect(outcome!.failed[0]?.item.id).toBe('b');
  });
});

describe('useBulkDispatch onClaimedFailures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hands the claimed items to the caller', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const onClaimedFailures = vi.fn();

    await act(async () => {
      await result.current.run(
        [item('a'), item('b')],
        async i => {
          if (i.id === 'b') throw new Error('blocked');
        },
        { claimFailure: () => true, onClaimedFailures }
      );
    });

    expect(onClaimedFailures).toHaveBeenCalledTimes(1);
    expect(onClaimedFailures.mock.calls[0]?.[0]).toEqual([item('b')]);
  });

  it('is not called when nothing is claimed', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const onClaimedFailures = vi.fn();

    await act(async () => {
      await result.current.run([item('a')], async () => undefined, {
        claimFailure: () => true,
        onClaimedFailures,
      });
    });

    expect(onClaimedFailures).not.toHaveBeenCalled();
  });

  // Without this, a retried item that comes back claimable is filtered out of
  // the toast AND never reaches the caller's dialog — the failure disappears
  // entirely.
  it('fires on a RETRY that produces a newly claimable failure', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const onClaimedFailures = vi.fn();
    let attempt = 0;

    await act(async () => {
      await result.current.run(
        [item('a')],
        async () => {
          attempt += 1;
          throw new Error(attempt === 1 ? 'network down' : 'blocked');
        },
        {
          claimFailure: (_i, error) => (error as Error).message === 'blocked',
          onClaimedFailures,
        }
      );
    });

    expect(onClaimedFailures).not.toHaveBeenCalled();

    await act(async () => {
      retryActionFromCall().onClick(mouseEvent());
    });

    await waitFor(() => expect(onClaimedFailures).toHaveBeenCalledTimes(1));
    expect(onClaimedFailures.mock.calls[0]?.[0]).toEqual([item('a')]);
  });
});

describe('useBulkDispatch retry while another batch is in flight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // MYK9-593. Sonner dismisses a toast when its action is clicked, and `retry`
  // is a latched no-op while another dispatch is running. Clicking "Retry
  // failed" on a still-visible partial-failure toast therefore used to take the
  // failure report away and put nothing in its place.
  //
  // These assertions are against the MOCKED sonner, so they pin the payload and
  // the preventDefault call, not what the user ends up seeing. The test that can
  // fail on a toast that is dismissed anyway lives in
  // useBulkDispatch.toaster.test.tsx, which renders the real <Toaster/>.
  it('re-shows the same failure report instead of swallowing the retry', async () => {
    let releaseSecond!: () => void;
    const second = new Promise<void>(resolve => {
      releaseSecond = resolve;
    });
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));

    // Batch #1 partially fails and leaves a toast with a Retry action.
    await act(async () => {
      await result.current.run([item('a'), item('b')], async i => {
        if (i.id === 'b') throw new Error('network down');
      });
    });
    const retry = retryActionFromCall();
    expect(toast.error).toHaveBeenCalledTimes(1);

    // Batch #2 starts and holds the in-flight latch.
    let inFlight!: Promise<unknown>;
    await act(async () => {
      inFlight = result.current.run([item('c')], async () => {
        await second;
      });
      await Promise.resolve();
    });

    // Clicking Retry on the first toast while the latch is held.
    const event = mouseEvent();
    await act(async () => {
      retry.onClick(event);
    });

    // Sonner dismisses the toast after onClick unless the handler prevents it.
    expect(event.preventDefault).toHaveBeenCalledTimes(1);

    // The failure report survives: same title, same detail line, same Retry
    // action, same toast id, plus a note saying why nothing ran.
    expect(toast.error).toHaveBeenCalledTimes(2);
    const [title, options] = vi.mocked(toast.error).mock.calls[1] as [
      string,
      { id?: string | number; description?: string; action?: { label: string } },
    ];
    expect(title).toContain('1 failed');
    expect(options.description).toContain('network down');
    expect(options.description).toContain('Still working on the previous batch');
    expect(options.action?.label).toBe('Retry failed');
    expect(options.id).toBe('failure-toast');

    await act(async () => {
      releaseSecond();
      await inFlight;
    });
  });

  // Control: with the latch free the same action dispatches the retry.
  it('dispatches the retry when no batch is in flight', async () => {
    const { result } = renderHook(() => useBulkDispatch<Item>({ getLabel: i => i.id }));
    const runItem = vi.fn(async (i: Item) => {
      if (i.id === 'b') throw new Error('network down');
    });

    await act(async () => {
      await result.current.run([item('a'), item('b')], runItem);
    });

    const retry = retryActionFromCall();
    runItem.mockClear();
    runItem.mockImplementation(async () => undefined);

    const event = mouseEvent();
    await act(async () => {
      retry.onClick(event);
    });

    await waitFor(() => expect(runItem).toHaveBeenCalledTimes(1));
    expect(runItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    // A real retry keeps sonner's default dismissal — only the busy branch opts out.
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
