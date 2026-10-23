import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStepUpFetch, STEP_UP_SQLSTATE } from '@/features/step-up/stepUpFetch';
import { resetStepUpStore } from '@/features/step-up/stepUpStore';
import { testJwt } from '@/features/step-up/stepUpTestTokens';
import { classifyRefreshFailure } from '@/features/at-show/missingShowState';
import { isTransientBrowserFetchError } from '@/services/rbac/PermissionChecker';
import {
  getSyncErrorMessage,
  isAbortSyncError,
  SAFE_SYNC_REFRESH_ERROR,
} from '@/services/replication/syncErrorUtils';
import {
  createReadDeadlineFetch,
  isDeadlinedRead,
  isReadDeadlineTimeout,
  READ_DEADLINE_ERROR_NAME,
  READ_ONLY_RPCS,
  readDeadlineReason,
  SUPABASE_READ_DEADLINE_MS,
} from './readDeadlineFetch';

const HOST = 'https://x.supabase.co';
const CLASSES = `${HOST}/rest/v1/classes?select=id&show_id=eq.1`;
const RPC = (name: string) => `${HOST}/rest/v1/rpc/${name}`;

const DEADLINE_MESSAGE = `Read deadline of ${SUPABASE_READ_DEADLINE_MS} ms exceeded`;

/** A base fetch that never answers on its own; it rejects with the signal's reason, as fetch does. */
function hangingFetch() {
  return vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener('abort', () => reject(signal.reason));
      })
  );
}

/** A base fetch that stays pending forever and ignores any signal. */
const pendingForever = () => vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));

function settled(promise: Promise<unknown>) {
  const state = { done: false, error: undefined as unknown };
  promise.then(
    () => {
      state.done = true;
    },
    error => {
      state.done = true;
      state.error = error;
    }
  );
  return state;
}

describe('createReadDeadlineFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['GET', CLASSES, { method: 'GET' }],
    ['HEAD (count query)', CLASSES, { method: 'HEAD' }],
    ['an unspecified method', CLASSES, undefined],
    ['POST to an allowlisted rpc', RPC('get_user_permissions'), { method: 'POST' }],
  ])('rejects a hung %s at the deadline as a transient TimeoutError', async (_l, url, init) => {
    const base = hangingFetch();
    const state = settled(createReadDeadlineFetch(base)(url, init));

    await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS - 1);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(state.done).toBe(true);
    const error = state.error as Error;
    expect(error.name).toBe(READ_DEADLINE_ERROR_NAME);
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe(DEADLINE_MESSAGE);
    expect(isTransientBrowserFetchError(error)).toBe(true);
  });

  it.each([
    ['an unlisted rpc', 'POST', RPC('ringside_update_entry')],
    ['a table PATCH', 'PATCH', `${HOST}/rest/v1/entries?id=eq.1`],
    ['a table POST', 'POST', `${HOST}/rest/v1/entries`],
    ['a table DELETE', 'DELETE', `${HOST}/rest/v1/entries?id=eq.1`],
    ['an auth call', 'POST', `${HOST}/auth/v1/token`],
    ['an edge function', 'POST', `${HOST}/functions/v1/x`],
    ['a storage GET', 'GET', `${HOST}/storage/v1/object/x`],
    ['an auth GET', 'GET', `${HOST}/auth/v1/user`],
  ])('never cuts off %s', async (_l, method, url) => {
    const base = pendingForever();
    const callerSignal = new AbortController().signal;
    const state = settled(createReadDeadlineFetch(base)(url, { method, signal: callerSignal }));

    await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS * 10);

    expect(base).toHaveBeenCalledTimes(1);
    expect(base.mock.calls[0][1]?.signal).toBe(callerSignal);
    expect(state.done).toBe(false);
  });

  it('passes an unsignalled write through with no signal added', async () => {
    const base = pendingForever();
    void createReadDeadlineFetch(base)(`${HOST}/rest/v1/entries`, { method: 'POST' });
    expect(base.mock.calls[0][1]?.signal).toBeUndefined();
  });

  it('resolves a read that answers in time; the deadline firing after a full read is a no-op', async () => {
    const response = new Response('[]');
    let signal: AbortSignal | null | undefined;
    const base = vi.fn<typeof fetch>(async (_i, init) => {
      signal = init?.signal;
      return response;
    });

    const result = await createReadDeadlineFetch(base)(CLASSES, { method: 'GET' });
    expect(result).toBe(response);
    await expect(result.text()).resolves.toBe('[]');

    await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS * 2);
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the base fetch rejects', async () => {
    const base = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createReadDeadlineFetch(base)(CLASSES)).rejects.toThrow('Failed to fetch');
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('response bodies', () => {
    /** A response whose body never closes and errors with the signal's reason on abort. */
    function stalledBodyFetch() {
      return vi.fn<typeof fetch>(async (_i, init) => {
        const signal = init?.signal;
        const body = new ReadableStream({
          start(controller) {
            signal?.addEventListener('abort', () => controller.error(signal.reason));
          },
        });
        return new Response(body);
      });
    }

    it('bounds a stalled body: text() rejects at the deadline with the TimeoutError', async () => {
      const res = await createReadDeadlineFetch(stalledBodyFetch())(CLASSES);
      const state = settled(res.text());

      await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS - 1);
      expect(state.done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(state.done).toBe(true);
      expect((state.error as Error).name).toBe('TimeoutError');
      expect(isTransientBrowserFetchError(state.error)).toBe(true);
    });

    it('a caller abort after headers still aborts the body read, with the caller reason', async () => {
      const caller = new AbortController();
      const res = await createReadDeadlineFetch(stalledBodyFetch())(CLASSES, {
        signal: caller.signal,
      });
      const state = settled(res.text());

      const reason = new DOMException('caller gave up', 'AbortError');
      caller.abort(reason);
      await vi.advanceTimersByTimeAsync(0);

      expect(state.done).toBe(true);
      expect(state.error).toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('aborts at once, with its reason, when the caller signal aborts first', async () => {
    const base = hangingFetch();
    const caller = new AbortController();
    const state = settled(createReadDeadlineFetch(base)(CLASSES, { signal: caller.signal }));

    const reason = new DOMException('caller gave up', 'AbortError');
    caller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);

    expect(state.done).toBe(true);
    expect(state.error).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    const base = hangingFetch();
    const caller = new AbortController();
    const reason = new Error('already gone');
    caller.abort(reason);
    const state = settled(createReadDeadlineFetch(base)(CLASSES, { signal: caller.signal }));
    await vi.advanceTimersByTimeAsync(0);

    expect(state.error).toBe(reason);
  });

  it('lets the caller retry: a second attempt runs after the first hits the deadline', async () => {
    const response = new Response('[]');
    const base = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(hangingFetch())
      .mockResolvedValueOnce(response);
    const deadlined = createReadDeadlineFetch(base);
    // The shape of useRbacLifecycle's loop: retry once on a transient failure.
    const withRetry = async () => {
      try {
        return await deadlined(RPC('get_user_permissions'), { method: 'POST' });
      } catch (error) {
        if (!isTransientBrowserFetchError(error)) throw error;
        return deadlined(RPC('get_user_permissions'), { method: 'POST' });
      }
    };

    const result = withRetry();
    expect(base).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS);

    await expect(result).resolves.toBe(response);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('honours a custom deadline', async () => {
    const state = settled(createReadDeadlineFetch(hangingFetch(), 50)(CLASSES));
    await vi.advanceTimersByTimeAsync(50);
    expect((state.error as Error).name).toBe('TimeoutError');
    expect((state.error as Error).message).toBe('Read deadline of 50 ms exceeded');
  });
});

describe('isDeadlinedRead', () => {
  it.each([
    [CLASSES, undefined, true],
    [CLASSES, { method: 'GET' }, true],
    [CLASSES, { method: 'get' }, true],
    [CLASSES, { method: 'HEAD' }, true],
    [new URL(CLASSES), { method: 'GET' }, true],
    [CLASSES, { method: 'POST' }, false],
    [CLASSES, { method: 'PATCH' }, false],
    [CLASSES, { method: 'DELETE' }, false],
    [`${HOST}/rest/v1/entries`, { method: 'POST' }, false],
    [`${HOST}/auth/v1/user`, { method: 'GET' }, false],
    [`${HOST}/storage/v1/object/x`, { method: 'GET' }, false],
    [`${HOST}/functions/v1/x`, { method: 'GET' }, false],
    [`${HOST}/realtime/v1/api/broadcast`, { method: 'POST' }, false],
    [RPC('get_user_permissions'), { method: 'POST' }, true],
    [`${RPC('get_user_permissions')}?x=1`, { method: 'POST' }, true],
    [RPC('get_user_permissions'), { method: 'GET' }, true],
    [RPC('ringside_update_entry'), { method: 'POST' }, false],
    [RPC('self_checkin_entry'), { method: 'POST' }, false],
    [RPC('get_user_permissions_extra'), { method: 'POST' }, false],
    [`${HOST}/rest/v1/rpc/`, { method: 'POST' }, false],
  ])('%s %j -> %s', (url, init, expected) => {
    expect(isDeadlinedRead(url, init)).toBe(expected);
  });

  it('classifies a Request object by its own method and url', () => {
    expect(isDeadlinedRead(new Request(CLASSES))).toBe(true);
    expect(isDeadlinedRead(new Request(CLASSES, { method: 'PATCH', body: '{}' }))).toBe(false);
    expect(
      isDeadlinedRead(new Request(RPC('get_user_roles'), { method: 'POST', body: '{}' }))
    ).toBe(true);
  });

  it('allowlists exactly the first-paint read rpcs', () => {
    expect([...READ_ONLY_RPCS].sort()).toEqual(
      [
        'get_account_today_entries',
        'get_effective_permissions',
        'get_show_class_hide_counts',
        'get_show_judges',
        'get_user_permissions',
        'get_user_roles',
        'user_has_permission',
      ].sort()
    );
  });
});

describe('under the step-up layer', () => {
  const STALE = testJwt('u1', 14 * 86_400, 'stale');
  const FRESH = testJwt('u1', 1, 'fresh');

  beforeEach(() => {
    resetStepUpStore();
  });
  afterEach(() => {
    resetStepUpStore();
  });

  it('arms a fresh deadline on a step-up replay', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const base = vi.fn<typeof fetch>(async (_i, init) => {
      signals.push(init?.signal);
      return signals.length === 1
        ? new Response(JSON.stringify({ code: STEP_UP_SQLSTATE }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('{}', { status: 200 });
    });
    const fetcher = createStepUpFetch(async () => FRESH, createReadDeadlineFetch(base));

    const result = await fetcher(RPC('get_user_roles'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${STALE}` },
    });

    expect(result.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBeDefined();
    expect(signals[1]).toBeDefined();
    expect(signals[1]).not.toBe(signals[0]);
    expect(signals[1]?.aborted).toBe(false);
  });
});

describe('a Request object carrying its own signal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards the Request signal to the deadline controller', async () => {
    const caller = new AbortController();
    const request = new Request(CLASSES, { signal: caller.signal });
    const state = settled(createReadDeadlineFetch(hangingFetch())(request));

    const reason = new DOMException('request cancelled', 'AbortError');
    caller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);

    expect(state.done).toBe(true);
    expect((state.error as Error).name).toBe('AbortError');
  });
});

describe('how the replication layer sees a deadline abort', () => {
  const SYNC_MESSAGE = `Supabase query failed: TimeoutError: ${DEADLINE_MESSAGE}`;

  it('is not a cancelled sync, and surfaces as a visible refresh failure', () => {
    expect(isAbortSyncError(new Error(SYNC_MESSAGE))).toBe(false);
    expect(getSyncErrorMessage(new Error(SYNC_MESSAGE))).toBe(SAFE_SYNC_REFRESH_ERROR);
  });

  it('still reads as unreachable to the show boundary', () => {
    expect(classifyRefreshFailure(SYNC_MESSAGE)).toBe('unreachable');
  });
});

describe('isReadDeadlineTimeout (MYK9-1374)', () => {
  it('recognises the abort in every shape it reaches a caller', () => {
    const reason = readDeadlineReason();
    expect(isReadDeadlineTimeout(reason)).toBe(true);
    expect(isReadDeadlineTimeout(new Error(`TimeoutError: ${DEADLINE_MESSAGE}`))).toBe(true);
    expect(
      isReadDeadlineTimeout(new Error(`Supabase query failed: TimeoutError: ${DEADLINE_MESSAGE}`))
    ).toBe(true);
    expect(isReadDeadlineTimeout(new Error('wrapped', { cause: reason }))).toBe(true);
    expect(isReadDeadlineTimeout({ message: DEADLINE_MESSAGE })).toBe(true);
  });

  it('does not match other transient failures, a deliberate abort, or nothing', () => {
    expect(isReadDeadlineTimeout(new DOMException('cancelled', 'AbortError'))).toBe(false);
    expect(isReadDeadlineTimeout(new TypeError('Failed to fetch'))).toBe(false);
    expect(isReadDeadlineTimeout(new Error('canceling statement due to statement timeout'))).toBe(
      false
    );
    expect(isReadDeadlineTimeout(undefined)).toBe(false);
    expect(isReadDeadlineTimeout('TimeoutError')).toBe(false);
    const loop = new Error('loop');
    (loop as { cause?: unknown }).cause = loop;
    expect(isReadDeadlineTimeout(loop)).toBe(false);
  });
});
