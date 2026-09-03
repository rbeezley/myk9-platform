import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery, onlineManager } from '@tanstack/react-query';
import React from 'react';
import { useRefetchQueriesOnReconnect } from '../useRefetchQueriesOnReconnect';

/**
 * These tests are behavioural — they count real `queryFn` calls — rather than
 * spying on `invalidateQueries` or `onlineManager.setOnline`.
 *
 * Spying does not work here, and the reason is worth recording. `onlineManager`
 * binds its own window listeners through `this.setOnline.bind(this)` when the
 * QueryClient mounts, which is AFTER `vi.spyOn` installs the spy — so TanStack's
 * own bookkeeping calls run through the spy too, indistinguishable from the
 * hook's. Two successive attempts to count around that interleaving produced
 * off-by-one and off-by-zero results that looked like hook bugs and were not.
 *
 * The scenario below sidesteps all of it by testing the case the hook uniquely
 * fixes, where TanStack provably does nothing on its own.
 */

/** `navigator.onLine` is a getter on a shared global; redefine, never assign. */
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { get: () => value, configurable: true });
}

/**
 * Reproduce a COLD OFFLINE BOOT: the device has no signal, but `onlineManager`
 * believes it is online because no `offline` event ever fired — it initialises
 * `#online = true` and only changes on an event. This is the real MYK9-365 state
 * and the one where TanStack's own reconnect handling is a no-op: the later
 * `online` event calls `setOnline(true)` on a manager already holding `true`, so
 * nothing is notified and nothing refetches. Any refetch observed after this
 * setup is therefore attributable to the hook.
 */
function enterColdOfflineBoot() {
  onlineManager.setOnline(true);
  setOnLine(false);
}

function makeClient() {
  // Do NOT add `networkMode: 'always'` here. TanStack derives
  // `refetchOnReconnect` from it — `'always'` makes it default to FALSE — so
  // that single option quietly opts EVERY query out and these tests would pass
  // for the wrong reason. That happened while this file was being written.
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
}

describe('useRefetchQueriesOnReconnect', () => {
  beforeEach(() => {
    setOnLine(true);
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setOnLine(true);
    // `onlineManager` is a module singleton shared by every test in the run.
    // Leaving it offline would silently pause queries in unrelated files.
    onlineManager.setOnline(true);
  });

  it('refetches after a cold boot that started offline, when signal returns', async () => {
    const queryFn = vi.fn().mockResolvedValue('data');
    const client = makeClient();
    enterColdOfflineBoot();

    function Screen() {
      useRefetchQueriesOnReconnect();
      useQuery({ queryKey: ['thing'], queryFn });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    );
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    client.clear();
  });

  // Codex review catch (P2), verified against source before accepting.
  //
  // `refetchOnReconnect` governs TanStack's OWN reconnect trigger and has no
  // effect on an explicit `invalidateQueries()`, so the first version of this
  // hook silently overrode queries that opted out. Ringside's entry list is
  // exactly that case: `packages/ringside/src/pages/EntryList/hooks/
  // useEntryListData.ts` sets `refetchOnReconnect: false` and routes
  // invalidation through a replication subscription that skips refreshes during
  // a drag, so refetching it on reconnect could snap a judge's in-progress
  // run-order drag back to the server's order, mid-show.
  it('leaves a query with refetchOnReconnect: false alone', async () => {
    const ordinaryFn = vi.fn().mockResolvedValue('ordinary');
    const optedOutFn = vi.fn().mockResolvedValue('opted-out');
    const client = makeClient();
    enterColdOfflineBoot();

    function Screen() {
      useRefetchQueriesOnReconnect();
      useQuery({ queryKey: ['ordinary'], queryFn: ordinaryFn });
      useQuery({ queryKey: ['opted-out'], queryFn: optedOutFn, refetchOnReconnect: false });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(ordinaryFn).toHaveBeenCalledTimes(1);
      expect(optedOutFn).toHaveBeenCalledTimes(1);
    });

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    // Positive control in the same test: the ordinary query MUST move, or
    // "the opt-out did not refetch" would prove nothing.
    await waitFor(() => expect(ordinaryFn).toHaveBeenCalledTimes(2));
    expect(optedOutFn).toHaveBeenCalledTimes(1);
    client.clear();
  });

  // An 'online' event with no drop is not a reconnect. Browsers do re-fire
  // these; treating each as a recovery would refetch the world at random.
  it('does not refetch on an online event with no drop in between', async () => {
    const queryFn = vi.fn().mockResolvedValue('data');
    const client = makeClient();

    function Screen() {
      useRefetchQueriesOnReconnect();
      useQuery({ queryKey: ['thing'], queryFn });
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    );
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('stops listening once unmounted', async () => {
    const queryFn = vi.fn().mockResolvedValue('data');
    const client = makeClient();
    enterColdOfflineBoot();

    function Screen() {
      useRefetchQueriesOnReconnect();
      return null;
    }
    // The query lives outside the unmounted component so it stays observed.
    function Holder() {
      useQuery({ queryKey: ['thing'], queryFn });
      return null;
    }
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    );
    render(
      <QueryClientProvider client={client}>
        <Holder />
      </QueryClientProvider>
    );
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

    unmount();
    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(queryFn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
