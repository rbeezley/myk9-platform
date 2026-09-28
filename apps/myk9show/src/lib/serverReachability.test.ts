import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REACHABILITY_FIRST_PROBE_MS,
  REACHABILITY_PROBE_INTERVAL_MS,
  isTransportFailure,
  markServerUnreachable,
  resetServerReachabilityForTests,
  useServerReachable,
} from './serverReachability';

const fetchMock = vi.fn();
const answered = () => new Response(null, { status: 401 });
const unreachable = () => new TypeError('Failed to fetch');

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('serverReachability (MYK9-864)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    setNavigatorOnline(true);
    resetServerReachabilityForTests();
  });

  afterEach(() => {
    resetServerReachabilityForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setNavigatorOnline(true);
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

  it('retries quickly first, backs off while the server stays away, and clears when it answers', async () => {
    const { result } = renderHook(() => useServerReachable());

    act(() => markServerUnreachable());
    expect(result.current).toBe(false);

    fetchMock.mockRejectedValueOnce(unreachable());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_FIRST_PROBE_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);

    fetchMock.mockResolvedValueOnce(answered());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS - 1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS * 4));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('probes the Supabase health endpoint without CORS so any response counts', async () => {
    renderHook(() => useServerReachable());
    fetchMock.mockResolvedValue(answered());

    act(() => markServerUnreachable());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_FIRST_PROBE_MS));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/health',
      expect.objectContaining({ mode: 'no-cors', cache: 'no-store' })
    );
  });

  it.each([
    ['the browser reports it is back online', () => window.dispatchEvent(new Event('online'))],
    ['the window regains focus', () => window.dispatchEvent(new Event('focus'))],
    ['the tab becomes visible', () => document.dispatchEvent(new Event('visibilitychange'))],
  ])('probes at once when %s', async (_, wake) => {
    const { result } = renderHook(() => useServerReachable());
    fetchMock.mockResolvedValue(answered());

    act(() => markServerUnreachable());
    await act(async () => {
      wake();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it('does not probe while the device is offline, and resumes when it comes back', async () => {
    const { result } = renderHook(() => useServerReachable());
    fetchMock.mockResolvedValue(answered());
    setNavigatorOnline(false);

    act(() => markServerUnreachable());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS * 4));
    expect(fetchMock).not.toHaveBeenCalled();

    setNavigatorOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(true);
  });

  it('stops probing once nothing shows the hint, and restarts when something does', async () => {
    const first = renderHook(() => useServerReachable());
    fetchMock.mockRejectedValue(unreachable());

    act(() => markServerUnreachable());
    first.unmount();
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS * 4));
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(answered());
    const second = renderHook(() => useServerReachable());
    expect(second.result.current).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_FIRST_PROBE_MS));
    expect(second.result.current).toBe(true);
  });

  it('does not reschedule when the last listener leaves during an in-flight probe', async () => {
    const view = renderHook(() => useServerReachable());
    let failProbe: (err: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise((_, reject) => {
        failProbe = reject;
      })
    );

    act(() => markServerUnreachable());
    await act(() => vi.advanceTimersByTimeAsync(REACHABILITY_FIRST_PROBE_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(async () => {
      failProbe(unreachable());
      await vi.advanceTimersByTimeAsync(REACHABILITY_PROBE_INTERVAL_MS * 4);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
