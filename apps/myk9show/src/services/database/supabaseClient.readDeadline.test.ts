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
