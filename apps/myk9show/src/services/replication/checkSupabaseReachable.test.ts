import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSupabaseReachable } from './checkSupabaseReachable';

describe('checkSupabaseReachable', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('calls the auth health endpoint with the anon key and a 3 s timeout signal', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await expect(checkSupabaseReachable()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/health',
      expect.objectContaining({
        headers: { apikey: 'anon-key' },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('is false on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(checkSupabaseReachable()).resolves.toBe(false);
  });

  it('is false when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(checkSupabaseReachable()).resolves.toBe(false);
  });
});
