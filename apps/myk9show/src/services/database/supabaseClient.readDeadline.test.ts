import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the configured client and the installed SDK, including its retry loop.
vi.unmock('@/services/database/supabaseClient');

import { supabase } from './supabaseClient';
import { SUPABASE_READ_DEADLINE_MS } from './readDeadlineFetch';

describe('configured Supabase read deadline (MYK9-1355)', () => {
  beforeAll(async () => {
    await supabase.auth.initialize();
    await supabase.auth.stopAutoRefresh();
  });

  afterAll(async () => {
    await supabase.auth.dispose();
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(['GET', 'HEAD'] as const)(
    'returns a stalled %s timeout at its deadline without an SDK retry',
    async kind => {
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) reject(signal.reason);
            else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
          })
      );
      vi.stubGlobal('fetch', transport);

      let settled = false;
      const request = supabase.from('shows').select('id', { head: kind === 'HEAD' });
      const result = request.then(response => {
        settled = true;
        return response;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS);
      expect(settled).toBe(true);
      expect((await result).error?.message).toContain('TimeoutError: Read deadline');

      await vi.advanceTimersByTimeAsync(7_000);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );

  it.each([503, 520, 'network'] as const)(
    'preserves SDK retries after a transient %s',
    async failure => {
      const delayMs = failure === 503 ? 2_000 : 1_000;
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => {
          if (failure === 'network') throw new TypeError('Failed to fetch');
          return new Response('temporarily unavailable', {
            status: failure,
            headers: failure === 503 ? { 'Retry-After': '2' } : undefined,
          });
        })
        .mockImplementation(
          async () =>
            new Response('[]', {
              headers: { 'Content-Type': 'application/json' },
            })
        );
      vi.stubGlobal('fetch', transport);
      let settled = false;
      const result = supabase
        .from('shows')
        .select('id')
        .then(response => {
          settled = true;
          return response;
        });
      await vi.advanceTimersByTimeAsync(delayMs - 1);
      expect(settled).toBe(false);
      expect(transport).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await result).error).toBeNull();
      expect(transport).toHaveBeenCalledTimes(2);
    }
  );

  describe('total read budget across retries (MYK9-1421)', () => {
    const unavailable = (headers?: Record<string, string>) =>
      new Response('temporarily unavailable', { status: 503, headers });

    /** Runs one SDK read against `transport`, recording when it settled. */
    function startRead(signal?: AbortSignal) {
      const state = { at: undefined as number | undefined };
      const t0 = Date.now();
      const query = supabase.from('shows').select('id');
      const result = (signal ? query.abortSignal(signal) : query).then(response => {
        state.at = Date.now() - t0;
        return response;
      });
      return { state, result };
    }

    it('gives up at the budget when each slow attempt ends in a 503', async () => {
      const transport = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((resolve, reject) => {
            const signal = init?.signal;
            const id = setTimeout(() => resolve(unavailable()), 9_000);
            signal?.addEventListener('abort', () => {
              clearTimeout(id);
              reject(signal.reason);
            });
          })
      );
      vi.stubGlobal('fetch', transport);
      const { state, result } = startRead();

      await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS);
      const response = await result;
      expect(state.at).toBeLessThanOrEqual(SUPABASE_READ_DEADLINE_MS);
      expect(response.error).not.toBeNull();
      const callsAtBudget = transport.mock.calls.length;
      expect(callsAtBudget).toBeLessThan(4);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(transport).toHaveBeenCalledTimes(callsAtBudget);
    });

    it('still recovers from several quick 503s inside the budget', async () => {
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => unavailable())
        .mockImplementationOnce(async () => unavailable())
        .mockImplementationOnce(async () => unavailable())
        .mockImplementation(
          async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })
        );
      vi.stubGlobal('fetch', transport);
      const { result } = startRead();

      await vi.advanceTimersByTimeAsync(7_000);
      expect((await result).error).toBeNull();
      expect(transport).toHaveBeenCalledTimes(4);
      expect(new Headers(transport.mock.calls[3]?.[1]?.headers).get('X-Retry-Count')).toBe('3');
    });

    it('returns the last 503 at once when its Retry-After would end at the budget, retries when it ends before', async () => {
      const exhausted = vi.fn<typeof fetch>(async () => unavailable({ 'Retry-After': '30' }));
      vi.stubGlobal('fetch', exhausted);
      const first = startRead();
      await vi.advanceTimersByTimeAsync(0);
      expect(first.state.at).toBe(0);
      expect((await first.result).status).toBe(503);
      expect(exhausted).toHaveBeenCalledTimes(1);

      const fits = vi
        .fn<typeof fetch>()
        .mockImplementationOnce(async () => unavailable({ 'Retry-After': '29' }))
        .mockImplementation(
          async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })
        );
      vi.stubGlobal('fetch', fits);
      const second = startRead();
      await vi.advanceTimersByTimeAsync(28_999);
      expect(fits).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect((await second.result).error).toBeNull();
      expect(fits).toHaveBeenCalledTimes(2);
    });

    it('lets caller cancellation win immediately during a backoff', async () => {
      const transport = vi.fn<typeof fetch>(async () => unavailable());
      vi.stubGlobal('fetch', transport);
      const controller = new AbortController();
      const { state, result } = startRead(controller.signal);
      await vi.advanceTimersByTimeAsync(500);
      expect(state.at).toBeUndefined();

      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(state.at).toBe(500);
      expect((await result).error?.message).toContain('AbortError');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(transport).toHaveBeenCalledTimes(1);
    });

    it('never retries or cuts off a write that gets a 503', async () => {
      const transport = vi.fn<typeof fetch>(async () => unavailable());
      vi.stubGlobal('fetch', transport);
      const response = await supabase.from('shows').delete().eq('id', 'show-1');
      expect(response.status).toBe(503);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0]?.[1]?.signal).toBeUndefined();
    });
  });

  it('allows a write to finish after the read deadline without aborting or replaying it', async () => {
    let finish!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal('fetch', transport);
    let settled = false;
    const result = supabase
      .from('shows')
      .delete()
      .eq('id', 'show-1')
      .then(response => {
        settled = true;
        return response;
      });
    await vi.advanceTimersByTimeAsync(SUPABASE_READ_DEADLINE_MS * 2);
    expect(settled).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.signal).toBeUndefined();

    finish(new Response(null, { status: 204 }));
    expect((await result).error).toBeNull();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
