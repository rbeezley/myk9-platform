import { describe, expect, it, vi } from 'vitest';
import { createSupabaseNetworkGuard } from './supabaseNetworkGuard';

describe('ordinary-test Supabase network isolation', () => {
  it('rejects hosted Supabase requests before delegating', async () => {
    const delegate = vi.fn<typeof fetch>();
    const guardedFetch = createSupabaseNetworkGuard(delegate);

    await expect(
      guardedFetch('https://sojmvhhwsjxmfistvzbe.supabase.co/rest/v1/entries')
    ).rejects.toThrow(/ordinary test attempted hosted Supabase access/i);
    expect(delegate).not.toHaveBeenCalled();
  });

  it('recognizes URL and Request inputs but allows unrelated hosts', async () => {
    const response = new Response(null, { status: 204 });
    const delegate = vi.fn<typeof fetch>().mockResolvedValue(response);
    const guardedFetch = createSupabaseNetworkGuard(delegate);

    await expect(
      guardedFetch(new Request('https://test.supabase.co/auth/v1/token'))
    ).rejects.toThrow(/host: test\.supabase\.co/i);
    await expect(guardedFetch(new URL('https://example.test/fixture.json'))).resolves.toBe(
      response
    );
    expect(delegate).toHaveBeenCalledTimes(1);
  });
});
