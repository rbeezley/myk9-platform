import type { Page, Request } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  waitForAppApiRequestsToSettle,
  watchAppApiRequests,
} from './appApiRequestTracker';

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
  it('waits for an app API request to finish and remain idle', async () => {
    const harness = createPageHarness();
    const pending = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);
    setTimeout(() => harness.emit('requestfinished', request), 5);

    await waitForAppApiRequestsToSettle(harness.page, pending, 'admin/dashboard', {
      idleMs: 5,
      timeoutMs: 100,
    });

    expect(pending.size).toBe(0);
  });

  it('reports an app API request that never settles', async () => {
    const harness = createPageHarness();
    const pending = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);

    await expect(
      waitForAppApiRequestsToSettle(harness.page, pending, 'admin/dashboard', {
        idleMs: 5,
        timeoutMs: 20,
      })
    ).rejects.toThrow(
      'admin/dashboard: app API requests did not settle within 20ms: https://example.supabase.co/rest/v1/clubs?select=*'
    );
  });

  it('ignores assets and document requests', async () => {
    const harness = createPageHarness();
    const pending = watchAppApiRequests(harness.page);

    harness.emit('request', createRequest('http://127.0.0.1:5173/admin/dashboard'));
    harness.emit('request', createRequest('http://127.0.0.1:5173/assets/app.js'));

    await waitForAppApiRequestsToSettle(harness.page, pending, 'admin/dashboard', {
      idleMs: 5,
      timeoutMs: 20,
    });

    expect(pending.size).toBe(0);
  });
});
