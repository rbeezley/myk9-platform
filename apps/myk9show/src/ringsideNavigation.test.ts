import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRingsideNavigation } from './ringsideNavigation';

const request = new Request('https://myk9show.com/at-show/show-1');
const shell = () => Promise.resolve(new Response('cached shell', { status: 200 }));
const appDocument = () =>
  new Response('<meta name="myk9-supabase-origin" content="test">', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('loadRingsideNavigation', () => {
  it('returns the current app document while online', async () => {
    const current = appDocument();
    const fetchDocument = vi.fn<typeof fetch>().mockResolvedValue(current);
    const fallback = vi.fn(shell);

    expect(await loadRingsideNavigation(request, fallback, fetchDocument, 3000)).toBe(current);
    expect(await current.text()).toContain('myk9-supabase-origin');
    expect(fetchDocument).toHaveBeenCalledWith(request, {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([500, 503])('uses the shell for an HTTP %i response', async status => {
    const fallback = vi.fn(shell);
    const fetchDocument = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('error', { status }));

    expect((await loadRingsideNavigation(request, fallback, fetchDocument, 3000)).status).toBe(200);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('uses the shell for a captive portal HTML page with HTTP 200', async () => {
    const fallback = vi.fn(shell);
    const fetchDocument = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>Sign in to venue wifi</html>', {
        headers: { 'content-type': 'text/html' },
      })
    );

    expect(
      await (await loadRingsideNavigation(request, fallback, fetchDocument, 3000)).text()
    ).toBe('cached shell');
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('uses the shell for a redirected portal page', async () => {
    const fallback = vi.fn(shell);
    const portal = appDocument();
    Object.defineProperty(portal, 'redirected', { value: true });
    const fetchDocument = vi.fn<typeof fetch>().mockResolvedValue(portal);

    expect(await (await loadRingsideNavigation(request, fallback, fetchDocument)).text()).toBe(
      'cached shell'
    );
  });

  it('uses the shell when fetch rejects offline', async () => {
    const fallback = vi.fn(shell);
    const fetchDocument = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await (await loadRingsideNavigation(request, fallback, fetchDocument)).text()).toBe(
      'cached shell'
    );
  });

  it('uses the shell after a bounded wait if the uplink stalls', async () => {
    vi.useFakeTimers();
    const fallback = vi.fn(shell);
    let signal: AbortSignal | undefined;
    const fetchDocument = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });

    const navigation = loadRingsideNavigation(request, fallback, fetchDocument, 3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect((await navigation).status).toBe(200);
    expect(signal?.aborted).toBe(true);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('uses the shell when the document body stalls after headers', async () => {
    vi.useFakeTimers();
    const fallback = vi.fn(shell);
    const response = appDocument();
    vi.spyOn(response, 'clone').mockReturnValue({
      text: () => new Promise<string>(() => {}),
    } as Response);
    const fetchDocument = vi.fn<typeof fetch>().mockResolvedValue(response);

    const navigation = loadRingsideNavigation(request, fallback, fetchDocument, 3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect((await navigation).status).toBe(200);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
