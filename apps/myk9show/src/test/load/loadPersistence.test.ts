import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countPersistedScores } from './loadPersistence';

describe('persisted-score evidence', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('preserves a blank HEAD failure as unknown persistence plus safe HTTP diagnostics', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', request);

    await expect(countPersistedScores(['entry-1'])).resolves.toEqual({
      count: null,
      failures: [{ kind: 'http', status: 400, entryCount: 1 }],
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not convert a successful response without an exact count into zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await expect(countPersistedScores(['entry-1'])).resolves.toEqual({
      count: null,
      failures: [{ kind: 'missing-count', status: 200, entryCount: 1 }],
    });
  });

  it('preserves an aborted transport failure without exporting the SDK error text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('secret-transport-detail'), { name: 'AbortError' })
        )
    );
    const result = await countPersistedScores(['entry-1']);
    expect(result).toEqual({
      count: null,
      failures: [{ kind: 'transport', status: 0, entryCount: 1 }],
    });
    expect(JSON.stringify(result)).not.toContain('secret-transport-detail');
  });

  it('retains an exact count and the scoped HEAD query on success', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'content-range': '*/1' },
      })
    );
    vi.stubGlobal('fetch', request);
    await expect(countPersistedScores(['entry-1'])).resolves.toEqual({ count: 1, failures: [] });
    const [url, options] = request.mock.calls[0];
    expect(new URL(url).searchParams.get('id')).toBe('in.(entry-1)');
    expect(new URL(url).searchParams.get('is_scored')).toBe('eq.true');
    expect(options.method).toBe('HEAD');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('avoids a remote query when no scores were attempted', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(countPersistedScores([])).resolves.toEqual({ count: 0, failures: [] });
    expect(request).not.toHaveBeenCalled();
  });

  it('never exports a server response body into failure diagnostics', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('credential=secret-value https://private.example', { status: 400 })
        )
    );
    const result = await countPersistedScores(['entry-1']);
    expect(result.failures).toEqual([{ kind: 'http', status: 400, entryCount: 1 }]);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });
});
