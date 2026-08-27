import type { Page, Request } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForAppApiRequestsToSettle, watchAppApiRequests } from './appApiRequestTracker';

type RequestEvent = 'request' | 'requestfinished' | 'requestfailed';

function createRequest(url: string) {
  return { url: () => url } as Request;
}

function createPageHarness() {
  const listeners = new Map<RequestEvent, Array<(request: Request) => void>>();
  const page = {
    on(event: RequestEvent, listener: (request: Request) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return page;
    },
    waitForTimeout(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
  } as unknown as Page;

  return {
    page,
    emit(event: RequestEvent, request: Request) {
      for (const listener of listeners.get(event) ?? []) listener(request);
    },
  };
}

describe('app API request tracker', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for an app API request to finish and remain idle', async () => {
    vi.useFakeTimers();
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    setTimeout(() => harness.emit('request', request), 5);
    setTimeout(() => harness.emit('requestfinished', request), 10);

    let resolved = false;
    const settlementPromise = waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 15,
      timeoutMs: 100,
    }).then(settlement => {
      resolved = true;
      return settlement;
    });

    await vi.advanceTimersByTimeAsync(29);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const settlement = await settlementPromise;

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });

  it('tracks an app API request that started before the route sweep', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);
    setTimeout(() => harness.emit('requestfinished', request), 5);

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 100,
    });

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });

  it('reports an app API request that never settles', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 20,
    });

    expect(settlement).toEqual({
      settled: false,
      pendingUrls: ['https://example.supabase.co/rest/v1/clubs?select=*'],
    });
  });

  it('does not accept a request that finishes just before the timeout', async () => {
    // Fake timers keep "just before the timeout" exact. On a real clock the 15ms
    // poll can wake late, and its await continuation (a microtask) runs before the
    // 18ms requestfinished callback -- so the tracker reports the request as still
    // pending and the assertion fails only under full-suite CPU contention.
    vi.useFakeTimers();
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);
    setTimeout(() => harness.emit('requestfinished', request), 18);

    const settlementPromise = waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 15,
      timeoutMs: 20,
    });

    await vi.advanceTimersByTimeAsync(30);
    const settlement = await settlementPromise;

    expect(settlement).toEqual({ settled: false, pendingUrls: [] });
  });

  it('ignores assets and document requests', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);

    harness.emit('request', createRequest('http://127.0.0.1:5173/admin/dashboard'));
    harness.emit('request', createRequest('http://127.0.0.1:5173/assets/app.js'));

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 20,
    });

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });
});
