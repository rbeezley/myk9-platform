import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REACHABILITY_PROBE_INTERVAL_MS,
  isTransportFailure,
  markServerUnreachable,
  resetServerReachabilityForTests,
  useServerReachable,
} from './serverReachability';

const fetchMock = vi.fn();

describe('serverReachability (MYK9-864)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    resetServerReachabilityForTests();
  });

  afterEach(() => {
    resetServerReachabilityForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('classifies only a response with no HTTP status as a transport failure', () => {
    expect(isTransportFailure({ status: 0 })).toBe(true);
    expect(isTransportFailure({ status: 403 })).toBe(false);
    expect(isTransportFailure({ status: 503 })).toBe(false);
    expect(isTransportFailure({})).toBe(false);
  });

  it('starts reachable and sends no probe while nothing has failed', () => {
    const { result } = renderHook(() => useServerReachable());

    expect(result.current).toBe(true);
    vi.advanceTimersByTime(REACHABILITY_PROBE_INTERVAL_MS * 4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays unreachable while the probe fails, and clears once the server answers', async () => {
    const { result } = renderHook(() => useServerReachable());

    act(() => markServerUnreachable());
    expect(result.current).toBe(false);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS * 4));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('probes the Supabase health endpoint without CORS so any response counts', async () => {
    renderHook(() => useServerReachable());
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    act(() => markServerUnreachable());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/health',
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' })
    );
  });

  it('probes immediately when the browser reports it is back online', async () => {
    const { result } = renderHook(() => useServerReachable());
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    act(() => markServerUnreachable());
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });
});
