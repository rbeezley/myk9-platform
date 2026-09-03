import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRefetchQueriesOnReconnect } from '../useRefetchQueriesOnReconnect';

/**
 * `navigator.onLine` is a getter on a shared global; redefine rather than assign,
 * and put it back afterwards so one case cannot leak into the next.
 */
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { get: () => value, configurable: true });
}

function Probe() {
  useRefetchQueriesOnReconnect();
  return null;
}

function renderProbe(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>
  );
}

describe('useRefetchQueriesOnReconnect', () => {
  let client: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setOnLine(true);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setOnLine(true);
  });

  it('refetches when connectivity returns after a drop', () => {
    renderProbe(client);
    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  // The whole point is the TRANSITION. Firing on mount would refetch every
  // active query on every page load, which is a different (and worse) change.
  it('does not refetch on mount while already online', () => {
    renderProbe(client);
    expect(invalidate).not.toHaveBeenCalled();
  });

  // A page that BOOTS offline gets no 'offline' event — the browser only fires
  // on transitions. Mount must therefore seed from navigator.onLine, or the
  // first reconnect after a cold offline boot (the exact MYK9-365 scenario)
  // would look like "we were online all along" and refetch nothing.
  it('refetches after a cold boot that STARTED offline', () => {
    setOnLine(false);
    renderProbe(client);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  // An 'online' event with no intervening drop is not a reconnect. Browsers do
  // re-fire these; treating each as a recovery would refetch the world at random.
  it('ignores a repeated online event with no drop in between', () => {
    renderProbe(client);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('refetches once per drop, not once per event', () => {
    renderProbe(client);

    for (let i = 0; i < 3; i += 1) {
      act(() => {
        setOnLine(false);
        window.dispatchEvent(new Event('offline'));
      });
      act(() => {
        setOnLine(true);
        window.dispatchEvent(new Event('online'));
      });
    }
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderProbe(client);
    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    unmount();

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
